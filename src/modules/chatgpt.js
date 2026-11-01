const fs = require('fs');
const browserManager = require('./browser');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Newest ChatGPT UI first (textarea#pending-conversation-input, aria-label "Ask ChatGPT"),
// then the older layouts as fallbacks
const PROMPT_SELECTORS = [
    'textarea#pending-conversation-input',
    'textarea[aria-label*="ChatGPT"]',
    '[data-composer-input] textarea',
    'div#prompt-textarea',
    'textarea#prompt-textarea',
    'textarea[placeholder*="ChatGPT"]',
    '[contenteditable="true"]',
];

const SEND_SELECTOR = 'button[aria-label="Send"], button[data-testid="send-button"], button[aria-label*="Send prompt"]';
const STOP_SELECTOR = 'button[aria-label*="Stop" i], button[data-testid*="stop"]';

// Returns every top-level {...} block in the text. String-aware, so braces inside
// JSON string values don't break the matching.
const extractJsonObjects = (text) => {
    const found = [];
    for (let i = 0; i < text.length; i++) {
        if (text[i] !== '{') continue;
        let depth = 0, inString = false, escaped = false;
        for (let j = i; j < text.length; j++) {
            const c = text[j];
            if (inString) {
                if (escaped) escaped = false;
                else if (c === '\\') escaped = true;
                else if (c === '"') inString = false;
                continue;
            }
            if (c === '"') inString = true;
            else if (c === '{') depth++;
            else if (c === '}' && --depth === 0) {
                found.push(text.slice(i, j + 1));
                i = j;
                break;
            }
        }
    }
    return found;
};

// Picks the last JSON object across the candidate texts that looks like a video script
const findScriptJson = (texts) => {
    for (const text of texts) {
        if (!text) continue;
        const objects = extractJsonObjects(text).reverse();
        for (const raw of objects) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed.scenes) && parsed.scenes.length > 0) return parsed;
            } catch (e) { /* not valid JSON, keep looking */ }
        }
    }
    return null;
};

class ChatGPTModule {
    async submitPrompt(page, text, failureScreenshot) {
        let foundSelector = null;
        for (const selector of PROMPT_SELECTORS) {
            try {
                const el = await page.waitForSelector(selector, { timeout: 5000, visible: true });
                if (el) {
                    foundSelector = selector;
                    console.log(`Found visible prompt area with selector: ${selector}`);
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        if (!foundSelector) {
            await page.screenshot({ path: failureScreenshot });
            throw new Error(`Could not find visible ChatGPT prompt textarea. See ${failureScreenshot}`);
        }

        await page.click(foundSelector);

        // Paste text instantly instead of typing character by character
        await page.evaluate((selector, value) => {
            const el = document.querySelector(selector);
            if (el.tagName.toLowerCase() === 'textarea') {
                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
                if (nativeSetter) {
                    nativeSetter.call(el, value);
                } else {
                    el.value = value;
                }
                el.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                // For contenteditable div
                document.execCommand('insertText', false, value);
            }
        }, foundSelector, text);

        // Small delay and a typed space so React registers the input and enables Send
        await sleep(50);
        await page.type(foundSelector, ' ');
        await page.keyboard.press('Enter');

        // If Enter didn't submit (prompt still in the box), click the Send button directly
        await sleep(1000);
        const stillHasText = await page.evaluate((selector) => {
            const el = document.querySelector(selector);
            if (!el) return false;
            return (el.value ?? el.innerText ?? '').trim().length > 0;
        }, foundSelector);
        if (stillHasText) {
            console.log('Enter did not submit, clicking Send button...');
            const sendBtn = await page.$(SEND_SELECTOR);
            if (sendBtn) await sendBtn.click();
        }
    }

    // Collects text from code blocks, assistant messages and finally the whole thread.
    // Kept selector-light on purpose: ChatGPT renames its classes often, but the JSON
    // text itself is always on the page.
    async collectPageTexts(page) {
        return page.evaluate((stopSelector) => {
            const texts = [];
            const codeBlocks = Array.from(document.querySelectorAll('pre, code, .cm-content')).reverse();
            if (codeBlocks[0]) codeBlocks[0].scrollIntoView({ block: 'end' });
            codeBlocks.forEach(el => texts.push(el.innerText));

            const messages = document.querySelectorAll('[data-message-author-role="assistant"], [data-turn="assistant"], section[data-turn]');
            if (messages.length) texts.push(messages[messages.length - 1].innerText);

            const main = document.querySelector('main') || document.body;
            texts.push(main.innerText);

            return { generating: !!document.querySelector(stopSelector), texts };
        }, STOP_SELECTOR);
    }

    // Polls until a valid script JSON is on the page and unchanged across two polls
    // (i.e. streaming has finished)
    async waitForScriptJson(page, timeoutMs = 180000) {
        const start = Date.now();
        let previous = null;
        while (Date.now() - start < timeoutMs) {
            await sleep(2000);
            const { generating, texts } = await this.collectPageTexts(page);
            if (generating) continue;

            const parsed = findScriptJson(texts);
            if (!parsed) continue;

            const signature = JSON.stringify(parsed);
            if (signature === previous) return parsed;
            previous = signature;
        }
        return null;
    }

    // Fallback: press ChatGPT's own Copy buttons (newest first) and read the clipboard
    async readViaCopyButton(page) {
        try {
            await page.browserContext().overridePermissions('https://chatgpt.com', ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
            await page.bringToFront();
        } catch (e) {
            console.warn('Could not grant clipboard permission:', e.message);
            return null;
        }

        const buttons = (await page.$$('button[aria-label*="Copy" i], button[data-testid*="copy"]')).reverse();
        for (const button of buttons) {
            try {
                await button.click();
                await sleep(500);
                const text = await page.evaluate(() => navigator.clipboard.readText());
                const parsed = findScriptJson([text]);
                if (parsed) return parsed;
            } catch (e) { /* try the next copy button */ }
        }
        return null;
    }

    async generateScript(prompt) {
        let page;
        try {
            page = await browserManager.getPage();
            console.log('Navigating to ChatGPT...');
            await page.goto('https://chatgpt.com/', { waitUntil: 'networkidle2' });

            // Handle "Verify you are human" (Cloudflare/Turnstile)
            await this.handleVerification(page);

            // Check if we are on the landing page or logged in
            const isLoggedOut = await page.$('button[data-testid="login-button"]');
            if (isLoggedOut) {
                throw new Error('ChatGPT session expired. Please run manual login.');
            }

            console.log('Entering prompt...');
            await this.submitPrompt(page, prompt, 'chatgpt_failure.png');

            console.log('Waiting for ChatGPT to finish writing the script JSON...');
            let script = await this.waitForScriptJson(page);

            if (!script) {
                console.warn('Could not read JSON from the page, trying the Copy button...');
                script = await this.readViaCopyButton(page);
            }

            if (!script) {
                // Save the live (rendered) DOM so selectors can be fixed against the real markup
                await page.screenshot({ path: 'chatgpt_failure.png' }).catch(() => {});
                fs.writeFileSync('chatgpt_failure_dom.html', await page.content());
                throw new Error('Could not find a valid script JSON in the ChatGPT response. See chatgpt_failure.png and chatgpt_failure_dom.html');
            }

            console.log(`✅ Script JSON captured (${script.scenes.length} scenes).`);
            return script;

        } catch (error) {
            console.error('ChatGPT Generation Error:', error);
            throw error;
        }
    }

    async generateImage(imagePrompt, outputPath) {
        let page;
        let capturedImageBuffer = null;

        try {
            page = await browserManager.getPage();
            console.log('Navigating to ChatGPT for DALLE-3 image generation...');

            // ✅ FIX: Intercept the DALL-E image at the NETWORK level before CORS policies apply.
            // This avoids the canvas "tainted" bug that caused washed-out/white saved images.
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (req.isInterceptResolutionHandled()) return;
                req.continue().catch(() => {});
            });
            page.on('response', async (response) => {
                try {
                    const url = response.url();
                    const contentType = response.headers()['content-type'] || '';
                    // Capture DALL-E image CDN responses (estuary/content or oaidalleapiprodscus)
                    const isDalleImage = (
                        url.includes('estuary/content') ||
                        url.includes('oaidalleapiprodscus') ||
                        url.includes('openai.com/files')
                    ) && contentType.startsWith('image/');

                    if (isDalleImage && !capturedImageBuffer) {
                        console.log(`📸 Intercepted DALL-E image from network: ${url.substring(0, 80)}...`);
                        capturedImageBuffer = await response.buffer();
                        console.log(`✅ Image buffer captured (${(capturedImageBuffer.length / 1024).toFixed(1)} KB)`);
                    }
                } catch (e) {
                    // Some responses may fail to read buffer (e.g. redirects), ignore those
                }
            });

            await page.goto('https://chatgpt.com/', { waitUntil: 'networkidle2' });
            await this.handleVerification(page);

            const isLoggedOut = await page.$('button[data-testid="login-button"]');
            if (isLoggedOut) throw new Error('ChatGPT session expired. Please run manual login.');

            console.log('Entering image prompt into ChatGPT...');
            const finalPrompt = `Generate exactly 1 high quality image for this prompt. DO NOT write any text, strictly provide the image. Prompt: ${imagePrompt}`;
            await this.submitPrompt(page, finalPrompt, 'chatgpt_dalle_failure.png');

            console.log('Waiting for DALLE-3 generation to begin...');
            await new Promise(r => setTimeout(r, 2000));

            console.log('Waiting for generation to complete (up to 120 seconds)...');
            await page.waitForFunction(
                () => {
                    const stopBtns = document.querySelector('button[aria-label*="Stop"], button[data-testid*="stop"]');
                    if (stopBtns) return false;

                    const labels = Array.from(document.querySelectorAll('span'));
                    const isCreating = labels.some(l => l.innerText && l.innerText.toLowerCase().includes('creating image'));
                    if (isCreating) return false;

                    const images = document.querySelectorAll('img[alt^="Generated image"], img[src*="estuary/content"]');
                    if (images.length > 0) return true;

                    const messages = document.querySelectorAll('div[data-message-author-role="assistant"], section[data-turn="assistant"]');
                    if (messages.length === 0) return false;
                    const lastMessage = messages[messages.length - 1];
                    if (lastMessage.querySelector('.result-streaming')) return false;

                    return true;
                },
                { timeout: 120000, polling: 3000 }
            );

            // Give a short buffer for the response event to fire after DOM updates
            await new Promise(r => setTimeout(r, 1500));

            // --- Strategy 1: Use network-intercepted buffer (best quality, no CORS issues) ---
            if (capturedImageBuffer && capturedImageBuffer.length > 10000) {
                console.log('Saving intercepted DALL-E image buffer to disk...');
                fs.writeFileSync(outputPath, capturedImageBuffer);
                console.log(`✅ Image saved (network intercept) to ${outputPath}`);
                return outputPath;
            }

            // --- Strategy 2: Fallback — download via Node.js (not browser fetch) using the src URL ---
            console.warn('Network intercept missed image, falling back to Node.js download...');
            const imageUrl = await page.evaluate(() => {
                const imgs = Array.from(document.querySelectorAll('img[alt^="Generated image"], img[src*="estuary/content"]'));
                return imgs.length > 0 ? imgs[imgs.length - 1].src : null;
            });

            if (!imageUrl) {
                await page.screenshot({ path: 'chatgpt_image_not_found.png' });
                throw new Error('DALL-E image not found in the chat output.');
            }

            // Use Node.js https/http to download (no CORS restrictions on the Node side)
            const imageBuffer = await new Promise((resolve, reject) => {
                const urlModule = imageUrl.startsWith('https') ? require('https') : require('http');
                const chunks = [];
                urlModule.get(imageUrl, (res) => {
                    res.on('data', chunk => chunks.push(chunk));
                    res.on('end', () => resolve(Buffer.concat(chunks)));
                    res.on('error', reject);
                }).on('error', reject);
            });

            if (!imageBuffer || imageBuffer.length < 10000) {
                throw new Error(`Downloaded image is suspiciously small (${imageBuffer?.length} bytes). Generation may have failed.`);
            }

            console.log('Saving DALL-E image to disk (Node.js download)...');
            fs.writeFileSync(outputPath, imageBuffer);
            console.log(`✅ Image saved (Node.js fallback) to ${outputPath}`);
            return outputPath;

        } catch (error) {
            console.error('ChatGPT Image Generation Error:', error);
            throw error;
        } finally {
            // Always clean up request interception to avoid blocking future page use
            try {
                if (page) await page.setRequestInterception(false);
            } catch (_) {}
        }
    }

    async handleVerification(page) {
        try {
            console.log('Checking for human verification...');
            // Wait for Turnstile or Cloudflare "Just a moment" page
            let isVerified = false;
            let checks = 0;
            
            while (!isVerified && checks < 5) {
                const title = await page.title();
                const url = page.url();
                
                if (title.includes('Just a moment') || url.includes('challenges.cloudflare.com')) {
                    console.log('Verification page detected. Attempting to solve...');
                    
                    const turnstileIframe = await page.$('iframe[src*="cloudflare"]');
                    if (turnstileIframe) {
                        const frame = await turnstileIframe.contentFrame();
                        if (frame) {
                            const checkbox = await frame.waitForSelector('input[type="checkbox"]', { timeout: 15000 });
                            if (checkbox) {
                                const box = await checkbox.boundingBox();
                                if (box) {
                                    // Move mouse to the checkbox and click
                                    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
                                    await page.mouse.down();
                                    await new Promise(r => setTimeout(r, 100));
                                    await page.mouse.up();
                                    console.log('Successfully clicked verification checkbox.');
                                } else {
                                    await checkbox.click();
                                }
                                await new Promise(r => setTimeout(r, 10000)); // Wait for challenge to resolve
                            }
                        }
                    } else {
                        console.log('Turning wait for human to solve... (if headful)');
                        await new Promise(r => setTimeout(r, 15000));
                    }
                } else {
                    isVerified = true;
                    console.log('Verification cleared or not present.');
                }
                checks++;
                if (!isVerified) await new Promise(r => setTimeout(r, 5000));
            }
        } catch (e) {
            console.warn('Verification handling failed or timed out:', e.message);
        }
    }
}

module.exports = ChatGPTModule;

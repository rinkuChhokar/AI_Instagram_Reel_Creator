const browserManager = require('./browser');

class ChatGPTModule {
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
            const textareaSelectors = ['div#prompt-textarea', 'textarea#prompt-textarea', 'textarea[placeholder*="ChatGPT"]', '[contenteditable="true"]'];
            
            let foundSelector = null;
            for (const selector of textareaSelectors) {
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
                await page.screenshot({ path: 'chatgpt_failure.png' });
                throw new Error('Could not find visible ChatGPT prompt textarea. See chatgpt_failure.png');
            }

            // Click and type using the found selector
            await page.click(foundSelector);
            await page.type(foundSelector, prompt, { delay: 50 });
            await page.keyboard.press('Enter');

            console.log('Waiting for generation to start...');
            // Wait up to 15 seconds for the stop button to appear or send button to correctly disable
            try {
                await page.waitForFunction(() => {
                    const stopBtn = document.querySelector('button[aria-label*="Stop"], button[data-testid*="stop"]');
                    const sendBtn = document.querySelector('button[data-testid="send-button"]');
                    const isGenerating = stopBtn || (sendBtn && sendBtn.disabled);
                    const messages = document.querySelectorAll('div[data-message-author-role="assistant"]');
                    const isStreaming = messages.length > 0 && messages[messages.length - 1].querySelector('.result-streaming');
                    return isGenerating || isStreaming;
                }, { timeout: 15000, polling: 1000 });
            } catch (e) {
                console.log('Generation started very slowly or very quickly, proceeding to completion check...');
            }

            console.log('Waiting for response to complete...');
            // Now wait for generation to completely finish
            try {
                await page.waitForFunction(
                    () => {
                        const stopBtns = document.querySelector('button[aria-label*="Stop"], button[data-testid*="stop"], button[aria-label*="stop"]');
                        if (stopBtns) return false; // Still generating
                        
                        const messages = document.querySelectorAll('div[data-message-author-role="assistant"]');
                        if (messages.length === 0) return false; 

                        const lastMessage = messages[messages.length - 1];
                        if (lastMessage.querySelector('.result-streaming')) return false; // Still streaming

                        // Check for the appearance of the turn action Copy button
                        const actionButtons = Array.from(lastMessage.querySelectorAll('button'));
                        const hasTurnCopyBtn = actionButtons.some(b => 
                            (b.getAttribute('data-testid') || '').includes('copy-turn-action') ||
                            (b.className || '').includes('copy') && !b.innerText.includes('Copy code')
                        );

                        // Generation is done if: No stop button, no streaming class, and we have text.
                        // If we see the specific turn action copy button, even better.
                        return hasTurnCopyBtn || lastMessage.innerText.trim().length > 50;
                    },
                    { timeout: 120000, polling: 2000 }
                );
            } catch (e) {
                console.warn('Timeout waiting for completion, attempting to scrape anyway...');
            }

            console.log('Scraping response...');
            // Get the last message from ChatGPT
            const script = await page.evaluate(() => {
                const messages = document.querySelectorAll('div[data-message-author-role="assistant"]');
                const lastMessage = messages[messages.length - 1];
                if (!lastMessage) return null;
                
                // Try to find the Markdown content container
                const content = lastMessage.querySelector('.markdown') || lastMessage;
                
                // Try to find code block first
                const codeBlock = content.querySelector('code');
                if (codeBlock) return codeBlock.innerText;

                return content.innerText;
            });

            if (!script) throw new Error('Could not scrape script from ChatGPT');

            // Try to parse as JSON if possible, otherwise clean up
            try {
                let cleaned = script.replace(/```json|```/gi, '').trim();
                
                // ChatGPT's new UI sometimes prepends "JSON\n" or "json" 
                // to codeBlock.innerText because of the language badge.
                // To be bulletproof, we isolate the first { or [ to the last } or ].
                const firstBrace = cleaned.indexOf('{');
                const firstBracket = cleaned.indexOf('[');
                let startIdx = -1;
                if (firstBrace !== -1 && firstBracket !== -1) startIdx = Math.min(firstBrace, firstBracket);
                else if (firstBrace !== -1) startIdx = firstBrace;
                else if (firstBracket !== -1) startIdx = firstBracket;
                
                if (startIdx !== -1) {
                    const lastBrace = cleaned.lastIndexOf('}');
                    const lastBracket = cleaned.lastIndexOf(']');
                    let endIdx = -1;
                    if (lastBrace !== -1 && lastBracket !== -1) endIdx = Math.max(lastBrace, lastBracket);
                    else if (lastBrace !== -1) endIdx = lastBrace;
                    else if (lastBracket !== -1) endIdx = lastBracket;
                    
                    if (endIdx !== -1 && endIdx > startIdx) {
                        cleaned = cleaned.substring(startIdx, endIdx + 1);
                    }
                }
                
                return JSON.parse(cleaned);
            } catch (e) {
                console.warn('Response is not valid JSON, returning raw text.');
                return script;
            }

        } catch (error) {
            console.error('ChatGPT Generation Error:', error);
            throw error;
        }
    }

    async generateImage(imagePrompt, outputPath) {
        let page;
        const fs = require('fs');
        try {
            page = await browserManager.getPage();
            console.log('Navigating to ChatGPT for DALLE-3 fallback image generation...');
            
            await page.goto('https://chatgpt.com/', { waitUntil: 'networkidle2' });
            await this.handleVerification(page);

            const isLoggedOut = await page.$('button[data-testid="login-button"]');
            if (isLoggedOut) throw new Error('ChatGPT session expired. Please run manual login.');

            console.log('Entering image prompt into ChatGPT...');
            const textareaSelectors = ['div#prompt-textarea', 'textarea#prompt-textarea', 'textarea[placeholder*="ChatGPT"]', '[contenteditable="true"]'];
            
            let foundSelector = null;
            for (const selector of textareaSelectors) {
                try {
                    const el = await page.waitForSelector(selector, { timeout: 5000, visible: true });
                    if (el) { foundSelector = selector; break; }
                } catch (e) { continue; }
            }

            if (!foundSelector) {
                await page.screenshot({ path: 'chatgpt_dalle_failure.png' });
                throw new Error('Could not find visible ChatGPT prompt textarea.');
            }

            const finalPrompt = `Generate exactly 1 high quality image for this prompt. DO NOT write any text, strictly provide the image. Prompt: ${imagePrompt}`;
            
            await page.click(foundSelector);
            await page.type(foundSelector, finalPrompt, { delay: 50 });
            await page.keyboard.press('Enter');

            console.log('Waiting for DALLE-3 generation to begin...');
            await new Promise(r => setTimeout(r, 2000));
            
            console.log('Waiting for generation to complete (this may take up to 20 seconds)...');
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

            console.log('Extracting generated image from chat DOM...');
            const imageUrl = await page.evaluate(async () => {
                // Identify DALL-E images globally since we are just looking for the newest one
                const imgs = Array.from(document.querySelectorAll('img[alt^="Generated image"], img[src*="estuary/content"]'));
                
                if (imgs.length > 0) {
                    const img = imgs[imgs.length - 1]; // Pick the latest generated image
                    try {
                        const response = await fetch(img.src);
                        const blob = await response.blob();
                        return new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result);
                            reader.readAsDataURL(blob);
                        });
                    } catch (e) {
                         // DOM Canvas bridging fallback
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth || 1024;
                        canvas.height = img.naturalHeight || 1024;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        return canvas.toDataURL('image/png');
                    }
                }
                return null;
            });

            if (!imageUrl) {
                await page.screenshot({ path: 'chatgpt_image_not_found.png' });
                throw new Error('DALLE-3 image not found in the chat output.');
            }

            console.log('Saving DALLE-3 image to disk...');
            const base64Data = imageUrl.split(',')[1];
            fs.writeFileSync(outputPath, base64Data, 'base64');
            console.log(`✅ Image saved safely to ${outputPath}`);
            return outputPath;

        } catch (error) {
            console.error('ChatGPT Image Fallback Error:', error);
            throw error;
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

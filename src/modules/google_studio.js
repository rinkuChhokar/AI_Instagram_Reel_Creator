const browserManager = require('./browser');
const fs = require('fs-extra');
const path = require('path');

class GoogleStudioModule {
    async generateAudio(text, outputPath) {
        let page;
        try {
            page = await browserManager.getPage();
            console.log('Navigating to Google AI Studio Text-to-Speech...');
            // Go directly to the new Text-to-Speech playground URL
            await page.goto('https://aistudio.google.com/app/generate-speech?model=gemini-2.5-pro-preview-tts', { waitUntil: 'networkidle2' });

            // Check if logged in
            const isLoggedOut = await page.$('a[href*="accounts.google.com/ServiceLogin"]');
            if (isLoggedOut) {
                throw new Error('Google AI Studio session expired. Please run manual login.');
            }

            console.log('Waiting for Speech generation UI to load...');
            await page.waitForSelector('textarea, [contenteditable="true"], [role="textbox"]', { timeout: 30000 });
            await new Promise(r => setTimeout(r, 2000)); // wait for UI to fully settle

            console.log('Selecting Single-speaker audio mode...');
            const modeClicked = await page.evaluate(() => {
                const els = Array.from(document.querySelectorAll('.mat-button-toggle-label-content, mat-button-toggle, button'));
                const singleMode = els.find(b => b.innerText && b.innerText.includes('Single-speaker audio'));
                if (singleMode) {
                    singleMode.click();
                    const innerBtn = singleMode.querySelector('button');
                    if (innerBtn) innerBtn.click();
                    return true;
                }
                return false;
            });
            console.log('Single-speaker mode found and clicked:', modeClicked);
            await new Promise(r => setTimeout(r, 2000)); // Wait for DOM to adjust

            console.log('Entering text for audio conversion...');
            const inputBox = await page.evaluateHandle(() => {
                // Find all text elements that look like an input
                const inputs = Array.from(document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]'));
                // AI Studio specifically has a "Hello! We're excited" default phrase for TTS
                const target = inputs.find(el => (el.value || el.innerText || '').includes("Hello! We're excited"));
                if (target) return target;
                
                // Fallback: Pick the last input assuming the first might be "Style instructions"
                return inputs.length > 1 ? inputs[inputs.length - 1] : inputs[0];
            });

            if (!inputBox) throw new Error('Could not find generation text box');
            
            // Clear default text via evaluation
            await page.evaluate(el => {
                if (el.value !== undefined) el.value = '';
                else el.innerText = '';
            }, inputBox);
            
            // Focus and send text
            await inputBox.click();
            
            // Optimized: Paste text instantly
            await page.evaluate((el, text) => {
                if (el.tagName.toLowerCase() === 'textarea' || el.tagName.toLowerCase() === 'input') {
                    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set || 
                                         Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
                    if (nativeSetter) {
                        nativeSetter.call(el, text);
                    } else {
                        el.value = text;
                    }
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                    document.execCommand('insertText', false, text);
                }
            }, inputBox, text);
            
            await new Promise(r => setTimeout(r, 50));
            await page.keyboard.type(' ');
            
            console.log('Selecting voice and generating...');
            
            // Try to find a "Run" button usually located at the bottom or top right
            const runClicked = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
                const runBtn = buttons.find(b => {
                    const txt = b.innerText ? b.innerText.trim() : '';
                    return txt.includes('Run') && !txt.toLowerCase().includes('settings');
                });
                if (runBtn) {
                    runBtn.click();
                    return true;
                }
                return false;
            });

            if (!runClicked) {
                console.log('Run button not found, triggering via shortcut (Cmd/Ctrl + Enter)...');
                await page.keyboard.down('Control');
                await page.keyboard.press('Enter');
                await page.keyboard.up('Control');
            }

            console.log('Waiting for audio to be ready (checking Run/Stop states)...');
            
            // Wait for "Stop" button to disappear (meaning generation is completely done)
            await page.waitForFunction(
                () => {
                    const downloadBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && (b.innerText.includes('Download') || b.innerText.includes('Export')));
                    const audio = document.querySelector('audio');
                    const hasStopBtn = Array.from(document.querySelectorAll('button, div[role="button"]'))
                                          .some(b => b.innerText && b.innerText.includes('Stop'));
                    
                    const hasValidAudio = audio && audio.src && audio.src !== document.baseURI && audio.src !== window.location.href;
                    
                    return (downloadBtn || hasValidAudio) && !hasStopBtn;
                },
                { timeout: 120000, polling: 3000 }
            );

            console.log('Downloading audio...');
            const audioData = await page.evaluate(async () => {
                const audio = document.querySelector('audio');
                if (audio && audio.src) {
                    const src = audio.src;
                    if (src === document.baseURI || src === window.location.href) return null; // Invalid source
                    
                    const resp = await fetch(src);
                    const blob = await resp.blob();
                    const reader = new FileReader();
                    return new Promise((resolve) => {
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });
                }
                return null;
            });

            if (audioData) {
                const base64Data = audioData.split(',')[1];
                await fs.writeFile(outputPath, Buffer.from(base64Data, 'base64'));
                console.log(`Audio saved to ${outputPath}`);
            } else {
                console.log('Attempting to click download button if found...');
                // Fallback: Click download button and wait for file (requires CDPSession for downloads)
                // For now, assume blob approach works or throw
                throw new Error('Audio generation failed or download method not implemented');
            }

        } catch (error) {
            console.error('Google AI Studio Audio Generation Error:', error);
            throw error;
        }
    }
}

module.exports = GoogleStudioModule;

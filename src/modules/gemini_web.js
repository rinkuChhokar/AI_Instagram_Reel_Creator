const browserManager = require('./browser');
const fs = require('fs-extra');
const axios = require('axios');
const path = require('path');

class GeminiWebModule {
    async generateImage(prompt, outputPath) {
        let page;
        try {
            page = await browserManager.getPage();
            console.log('Navigating to Gemini...');
            await page.goto('https://gemini.google.com/app', { waitUntil: 'networkidle2' });

            // Check if logged in
            const isLoggedOut = await page.$('a[href*="accounts.google.com/ServiceLogin"]');
            if (isLoggedOut) {
                throw new Error('Gemini session expired. Please run manual login.');
            }

            console.log('Entering image prompt...');
            const inputSelector = 'div[role="textbox"]'; 
            await page.waitForSelector(inputSelector, { timeout: 30000 });
            
            // Image prompt should be specific for Gemini to trigger image generation
            const fullPrompt = `Generate a high-quality cinematic image of: ${prompt}`;
            await page.click(inputSelector);
            await page.type(inputSelector, fullPrompt);
            await page.keyboard.press('Enter');

            console.log('Waiting for generation to start...');
            // Wait for the "Stop" button to appear
            await page.waitForFunction(
                () => !!document.querySelector('.stop-icon') || !!document.querySelector('mat-icon[fonticon="stop"]'),
                { timeout: 10000, polling: 500 }
            ).catch(() => console.log('Stop icon did not appear explicitly, continuing...'));

            console.log('Waiting for response to complete (checking Stop icon state)...');
            // Wait for it to disappear, meaning it finished streaming
            await page.waitForFunction(
                () => !document.querySelector('.stop-icon') && !document.querySelector('mat-icon[fonticon="stop"]'),
                { timeout: 120000, polling: 3000 }
            );

            console.log('Waiting for image placeholder to finalize...');
            // Wait specifically for a large image to appear in the DOM
            await page.waitForFunction(() => {
                const images = Array.from(document.querySelectorAll('img[src*="googleusercontent.com"], img[src^="blob:https://gemini"]'));
                return images.some(img => {
                    const rect = img.getBoundingClientRect();
                    return rect.width > 200 || rect.height > 200 || img.naturalWidth > 200;
                });
            }, { timeout: 30000, polling: 1000 }).catch(() => console.log('Image not explicitly found in wait window, proceeding to exact check...'));

            console.log('Finding generated image...');
            const imageBase64 = await page.evaluate(async () => {
                const images = Array.from(document.querySelectorAll('img[src*="googleusercontent.com"], img[src^="blob:https://gemini"]'));
                // Filter out small avatars/icons by checking bounding rect or natural size
                const validImages = images.filter(img => {
                    const rect = img.getBoundingClientRect();
                    return rect.width > 200 || rect.height > 200 || img.naturalWidth > 200;
                });
                // Get the very last large image in the chat (most recent generation)
                const imgNode = validImages.length > 0 ? validImages[validImages.length - 1] : null;
                if (!imgNode) return null;

                // Because Gemini enforces strict CSP, we cannot fetch() blob URLs created by its workers.
                // We bypass this entirely by drawing the rendered image onto a canvas and extracting Base64!
                const canvas = document.createElement('canvas');
                canvas.width = imgNode.naturalWidth || imgNode.width || 1024;
                canvas.height = imgNode.naturalHeight || imgNode.height || 1024;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(imgNode, 0, 0, canvas.width, canvas.height);
                
                return canvas.toDataURL('image/png');
            });

            if (!imageBase64) throw new Error('No image found in Gemini response');

            console.log(`Saving image from blob to disk...`);
            const buffer = Buffer.from(imageBase64.split(',')[1], 'base64');
            await fs.ensureDir(path.dirname(outputPath));
            await fs.writeFile(outputPath, buffer);
            console.log(`Image saved to ${outputPath}`);

        } catch (error) {
            console.error('Gemini Image Generation Error:', error);
            throw error;
        }
    }

    async downloadImage(url, outputPath) {
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream'
        });

        await fs.ensureDir(path.dirname(outputPath));
        const writer = fs.createWriteStream(outputPath);

        return new Promise((resolve, reject) => {
            response.data.pipe(writer);
            let error = null;
            writer.on('error', err => {
                error = err;
                writer.close();
                reject(err);
            });
            writer.on('finish', () => {
                if (!error) resolve();
            });
        });
    }
}

module.exports = GeminiWebModule;

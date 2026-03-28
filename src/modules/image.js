const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { withRetry } = require('../utils/retry');

/**
 * Image Generation Module.
 * Uses Gemini as primary and Pollinations.ai + Placeholders as fallbacks.
 */
class ImageModule {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.modelName = "gemini-3.1-flash-image-preview";
  }

  async generateImage(prompt, outputPath) {
    console.log(`Generating image for: "${prompt.substring(0, 50)}..."`);
    
    // 1. Attempt Gemini (Paid/Quota tier)
    try {
      if (this.apiKey && this.apiKey !== 'YOUR_GEMINI_API_KEY') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`;
        const body = {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["IMAGE"] }
        };
        
        const imagePart = await withRetry(async () => {
            const res = await axios.post(url, body, { timeout: 15000 });
            const parts = res.data.candidates?.[0].content?.parts;
            return parts?.find(p => p.inlineData && p.inlineData.mimeType.startsWith('image/'));
        });

        if (imagePart) {
          fs.writeFileSync(outputPath, Buffer.from(imagePart.inlineData.data, 'base64'));
          return outputPath;
        }
      }
    } catch (e) {
      console.warn("Gemini Image failed or quota exceeded. Trying Pollinations.ai...");
    }

    // 2. Fallback: Pollinations.ai (Free AI Generation)
    try {
        // Use a simpler, shorter prompt for stability
        const simplePrompt = prompt.split('.')[0]; // Just the first sentence
        const encodedPrompt = encodeURIComponent(simplePrompt + " , 3d tech illustration, 9:16 vertical");
        const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1080&height=1920&nologo=true&seed=${Math.floor(Math.random() * 10000)}`;
        
        const response = await axios({
            method: 'get',
            url: pollinationsUrl,
            responseType: 'arraybuffer',
            timeout: 20000
        });

        fs.writeFileSync(outputPath, response.data);
        console.log(`Image generated via Pollinations: ${outputPath}`);
        return outputPath;
    } catch (e) {
        console.warn("Pollinations.ai failed. Using placeholder image...");
        
        // 3. Final Fallback: Random High-Quality Tech Placeholder
        try {
            const placeholderUrl = `https://picsum.photos/1080/1920?blur=1&random=${Math.random()}`;
            const response = await axios({
                method: 'get',
                url: placeholderUrl,
                responseType: 'arraybuffer'
            });
            fs.writeFileSync(outputPath, response.data);
            console.log(`Placeholder image saved: ${outputPath}`);
            return outputPath;
        } catch (pe) {
            console.error("Critical error: All image generation failed.");
            throw pe;
        }
    }
  }

  async generateSceneImages(scenes, outputDir) {
    const results = [];
    for (const scene of scenes) {
      const fileName = `scene_${scene.id}.png`;
      const filePath = path.join(outputDir, fileName);
      try {
          await this.generateImage(scene.visual_prompt, filePath);
      } catch (err) {
          console.error(`Failed to generate image for scene ${scene.id}, skipping...`);
      }
      results.push({ id: scene.id, imagePath: filePath });
    }
    return results;
  }
}

module.exports = ImageModule;

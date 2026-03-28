const { OpenAI } = require("openai");
const { withRetry } = require('../utils/retry');

/**
 * Script & Translation Module using Hugging Face Qwen.
 */
class GeneratorModule {
  constructor(apiKey) {
    // Note: apiKey here refers to HF_TOKEN passed from index.js
    this.client = new OpenAI({
      baseURL: "https://router.huggingface.co/v1",
      apiKey: apiKey,
    });
    this.modelName = "Qwen/Qwen3.5-397B-A17B:novita";
  }

  /**
   * Generates a 4-scene script for a project.
   */
  async generateScript(projectInfo) {
    return withRetry(async () => {
        console.log(`Generating script for: ${projectInfo.name} via Qwen`);
        
        const prompt = `Create a 4-scene Instagram Reel script (9:16) for the GitHub repository: ${projectInfo.name}.
        Description: ${projectInfo.description}
        
        The script must be in JSON format:
        {
          "scenes": [
            { "id": 1, "label": "HOOK", "content": "Scene text in English", "visual_prompt": "Prompt for AI image generation" },
            { "id": 2, "label": "PROBLEM", "content": "...", "visual_prompt": "..." },
            { "id": 3, "label": "SOLUTION", "content": "...", "visual_prompt": "..." },
            { "id": 4, "label": "CTA", "content": "Check out link in bio!", "visual_prompt": "..." }
          ]
        }
        Keep the content high-energy and concise. Return ONLY the JSON.`;

        const chatCompletion = await this.client.chat.completions.create({
            model: this.modelName,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
        });

        const text = chatCompletion.choices[0].message.content;
        return JSON.parse(text);
    });
  }

  /**
   * Translates the script into simple spoken Hindi.
   */
  async translateToHindi(script) {
    return withRetry(async () => {
        const prompt = `Translate this JSON script to energetic, natural spoken Hindi (for a reel voiceover). 
        Maintain the JSON structure but add a "hindi_content" field to each scene.
        Script: ${JSON.stringify(script)}`;

        const chatCompletion = await this.client.chat.completions.create({
            model: this.modelName,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
        });

        const text = chatCompletion.choices[0].message.content;
        console.log(text);
        return JSON.parse(text);
    });
  }
}

module.exports = GeneratorModule;

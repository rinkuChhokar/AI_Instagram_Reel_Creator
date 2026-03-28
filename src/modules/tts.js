const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { withRetry } = require('../utils/retry');

/**
 * Voice Generation Module using ElevenLabs.
 */
class TTSModule {
  constructor(apiKey) {
    this.apiKey = apiKey;
    // this.voiceId = "sarah"; // ElevenLabs common high-quality voice, can be adjusted for Hindi
    // Note: For Hindi, 'premade/hindi' or specific voice IDs are better.
    // I will use a known multilingual voice ID.
    this.voiceId = "uCOcKXWA2LilECG3nEom"; // Rachel (Multilingual v2 supports Hindi)
  }

  async generateHindiVoice(text, outputPath) {
    console.log(`Generating Audio via ElevenLabs for: "${text.substring(0, 50)}..."`);
    
    return withRetry(async () => {
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`;
        
        const response = await axios({
            method: 'post',
            url: url,
            data: {
                text: text,
                model_id: "eleven_multilingual_v2",
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75
                }
            },
            headers: {
                'xi-api-key': this.apiKey,
                'Content-Type': 'application/json',
            },
            responseType: 'arraybuffer'
        });

        fs.writeFileSync(outputPath, response.data);
        console.log(`Audio generated via ElevenLabs: ${outputPath}`);
        return outputPath;
    });
  }

  async generateSceneVoices(scenes, outputDir) {
    const results = [];
    for (const scene of scenes) {
      const fileName = `scene_${scene.id}.mp3`;
      const filePath = path.join(outputDir, fileName);
      await this.generateHindiVoice(scene.hindi_content, filePath);
      results.push({ id: scene.id, audioPath: filePath });
    }
    return results;
  }
}

module.exports = TTSModule;

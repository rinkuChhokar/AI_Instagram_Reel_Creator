const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const retry = require('./retry');

/**
 * Voice Generation Module using Resemble AI.
 */
class ResembleAIModule {
  constructor(apiKey, voiceId) {
    this.apiKey = apiKey;
    this.voiceId = voiceId;
  }

  async generateVoice(text, outputPath) {
    console.log(`Generating Audio via Resemble AI for: "${text.substring(0, 50)}..."`);
    
    return retry(async () => {
        const url = `https://f.cluster.resemble.ai/synthesize`;
        
        const response = await axios({
            method: 'post',
            url: url,
            data: {
                voice_uuid: this.voiceId,
                data: text,
                sample_rate: 48000,
                output_format: "mp3"
            },
            headers: {
                'Authorization': this.apiKey,
                'Content-Type': 'application/json',
                'Accept-Encoding': 'gzip'
            }
        });

        if (!response.data || !response.data.success) {
            throw new Error(`Resemble AI API Error: ${JSON.stringify(response.data.issues || response.data)}`);
        }

        const audioBuffer = Buffer.from(response.data.audio_content, 'base64');
        await fs.writeFile(outputPath, audioBuffer);
        
        console.log(`Audio generated via Resemble AI: ${outputPath}`);
        return outputPath;
    });
  }
}

module.exports = ResembleAIModule;

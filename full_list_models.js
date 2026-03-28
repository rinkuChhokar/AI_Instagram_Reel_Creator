require('dotenv').config();
const axios = require('axios');

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await axios.get(url);
    const models = response.data.models;
    
    console.log("=== Available Models (v1beta) ===");
    models.forEach(m => {
        console.log(`- ${m.name} [${m.supportedGenerationMethods.join(', ')}]`);
    });
  } catch (error) {
    console.error("Error:", error.response ? error.response.data : error.message);
  }
}

listModels();

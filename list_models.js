require('dotenv').config();
const axios = require('axios');

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  try {
    console.log("Fetching models list from v1beta...");
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await axios.get(url);
    console.log("Models (v1beta):", JSON.stringify(response.data.models.map(m => m.name), null, 2));
  } catch (error) {
    console.error("Error fetching v1beta models:", error.response ? error.response.data : error.message);
    
    console.log("\nFetching models list from v1...");
    try {
        const urlV1 = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;
        const responseV1 = await axios.get(urlV1);
        console.log("Models (v1):", JSON.stringify(responseV1.data.models.map(m => m.name), null, 2));
    } catch (e) {
        console.error("Error fetching v1 models:", e.response ? e.response.data : e.message);
    }
  }
}

listModels();

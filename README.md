# AI Scrapper Video Maker

**AI Scrapper Video Maker** is a fully automated, end-to-end headless browser pipeline that magically generates short-form video content (like Instagram Reels and YouTube Shorts) from a simple text prompt.

This project completely orchestrates and synchronizes **ChatGPT** (Scripting), **Google Gemini** (Image Generation), **Google AI Studio / ElevenLabs** (Text-to-Speech), and **Remotion** (Video Assembly) using persistent browser sessions specifically tailored to bypass strict anti-bot detections (BotGuard, Cloudflare) and Content Security Policies (CSP).

---

## 🌟 Modules & Pipeline
1. **ChatGPT Scraper (`src/modules/chatgpt.js`)**: Uses Puppeteer with Stealth Plugin to securely scrape `chatgpt.com`, dynamically bypassing human verification walls to parse structured JSON video scripts based on your prompt.
2. **Gemini Web (`src/modules/gemini_web.js`)**: Automates `gemini.google.com` to generate prompt-specific images. Employs advanced **Canvas drawing extraction** to seamlessly bypass strict `blob:` URL Content Security Policies and download the generated images.
3. **Google Studio TTS (`src/modules/google_studio.js`)**: Leverages `aistudio.google.com` for high-quality audio generation. Includes logic to seamlessly hot-swap from "Stealth Mode Chrome" to standard "Vanilla Chrome" to completely bypass BotGuard 403 Forbidden endpoints.
4. **ElevenLabs TTS (`src/modules/tts.js`)**: An alternative audio provider that can be triggered via a flag if you hit Google AI Studio's strict rate limits (429 Too Many Requests).
5. **Remotion (`src/remotion/*`)**: Programmatically composites the drafted `final_script.json`, `.png` files, and `.mp3` audio tracks into a polished, synced `final_reel.mp4` video!

---

## 🛠️ Setup & Requirements

1. **Install Node Utilities:**
   Make sure you have Node > 18 installed.
   ```bash
   npm install
   ```

2. **Environment Variables:**
   Create a `.env` file at the root of the project with your API keys (mainly utilized for fallbacks like ElevenLabs):
   ```env
   ELEVENLABS_API_KEY=your_elevenlabs_key_here
   ```

3. **Log in to your AI Accounts (One-time Setup):**
   Before running the fully headless automation, you must run the login flag to let the browser cache your authenticated sessions in the `.browser-data` folder.
   ```bash
   node index.js --login
   ```
   *This opens visible browser tabs for ChatGPT, Google Gemini, and Google AI Studio. Simply log in securely to all 3 pages, then close the script.*

---

## 🚀 Usage & Commands

You can run the full pipeline simply by passing your desired video topic/prompt as an argument:

```bash
node index.js "Create a 5 scene educational reel about Black Holes"
```

### 🚩 Available Flags

You can mix and match these flags to alter the behavior of the generator on the fly:

* `--login`
  Opens the browser session in headful (visible) mode so you can manually log into the AI services. Required on your absolute first run or if your session expires.

* `--reuse`
  **Extremely useful for editing/debugging!** If enabled, the script skips ChatGPT, Gemini, and TTS generation entirely and instantly jumps to the **Remotion video rendering step** utilizing the assets already saved in the `public/` directory (`final_script.json`, images, and audio).
  ```bash
  node index.js --reuse
  ```

* `--start-from-voice-generate-step`
  Skips the script and image generation steps and starts directly from voice generation. It expects `final_script.json` and all scene images to already be present in the `public` directory. Useful when you already have the script and images generated but need to re-run audio generation or video rendering.
  ```bash
  node index.js --start-from-voice-generate-step
  ```

* `--use-elevenlab`
  Bypasses the Google AI Studio TTS generation (which has very strict daily quotas) and instead routes text-to-speech requests through the official ElevenLabs API. 
  *(Requires `ELEVENLABS_API_KEY` in your `.env` file).*
  ```bash
  node index.js "Prompt here" --use-elevenlab
  ```

* `--res <resolution>`
  Overrides the final video export resolution for faster rendering while debugging. By default, it builds in `1080p`. Passing this flag perfectly downscales the resolution without breaking CSS layouts or text formatting!
  *(Accepts `1080p`, `720p`, `480p`, `360p`)*
  ```bash
  node index.js "Prompt here" --res 720p
  ```

* `--trending`
  Automatically fetches the #1 most trending repository on GitHub from the past 7 days and dynamically writes an engaging video script about it! You don't need to provide a custom prompt when using this flag.
  ```bash
  node index.js --trending
  ```

---

## 📂 Project Structure

```text
📁 AI Scrapper Video Maker
├── 📄 index.js                 # The main orchestrator of the pipeline
├── 📄 .env                     # Contains fallback API keys (ElevenLabs)
├── 📁 .browser-data            # (Auto-generated) Saves persistent browser auth
├── 📁 public                   # (Auto-generated) Video Assets
│   ├── 📄 final_script.json    # JSON parsed successfully from ChatGPT
│   ├── 📁 audio                # Generated TTS .mp3 files
│   ├── 📁 images               # Extracted Gemini .png files
│   └── 📄 final_reel.mp4       # The finalized, rendered output video!
└── 📁 src
    ├── 📁 modules              # Core scraping/automation logic
    │   ├── browser.js          # Handles Stealth vs Vanilla Chrome switching
    │   ├── chatgpt.js          # Handles ChatGPT DOM manipulation
    │   ├── gemini_web.js       # Handles Canvas image extraction
    │   ├── google_studio.js    # Handles Audio generation and UI polling
    │   ├── tts.js              # ElevenLabs API integration
    │   └── retry.js            # Universal error retry/handling loop
    └── 📁 remotion             # React-based composition logic
        ├── Main.jsx
        └── index.jsx
```

## ⚠️ Known Limitations
- **UI Dependency**: The web scrapers (`google_studio.js`, `gemini_web.js`, `chatgpt.js`) rely heavily on precise DOM element selectors. If Google or OpenAI fundamentally redesigns their web applications' DOM structures, the `waitForFunction` matchers inside these modules may timeout and require updating.
- **Quota Limits**: Google AI Studio has aggressive rate limiting (`429 You Exceeded Your Current Quota`). Use the `--use-elevenlab` flag to dynamically swap architecture if you encounter this limitation!

require('dotenv').config();
const path = require('path');
const fs = require('fs-extra');
const ChatGPTModule = require('./src/modules/chatgpt');
const GoogleStudioModule = require('./src/modules/google_studio');
const GeminiWebModule = require('./src/modules/gemini_web');
const TTSModule = require('./src/modules/tts');
const GitHubModule = require('./src/modules/github');
const GoogleDriveModule = require('./src/modules/google_drive');
const browserManager = require('./src/modules/browser');
const retry = require('./src/modules/retry');

// Helper to get audio duration using ffmpeg
const getAudioDuration = async (filePath) => {
    const { execSync } = require('child_process');
    const ffprobePath = require('ffprobe-static').path;
    
    try {
        const output = execSync(`"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
        return parseFloat(output.toString());
    } catch (e) {
        console.warn('Could not get duration via ffprobe, using default 5s');
        return 5;
    }
};

// Global Exception Handling
process.on('uncaughtException', (err) => {
  console.error('💥 CRITICAL: Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});

async function main() {
  try {
    const args = process.argv.slice(2);
    const isReuse = args.some(arg => arg === '--reuse');
    const isLogin = args.some(arg => arg === '--login');
    const useElevenLabs = args.some(arg => arg === '--use-elevenlab');
    const isTrending = args.some(arg => arg === '--trending');
    
    // Parse desired rendering resolution (e.g. --res 720p)
    const resIndex = args.indexOf('--res');
    const targetRes = resIndex !== -1 && resIndex + 1 < args.length ? args[resIndex + 1].toLowerCase() : '1080p';
    
    // Map resolution to rendering scale (Baseline is 1080p = 1)
    let renderScale = 1;
    if (targetRes.includes('720')) renderScale = 720 / 1080;
    else if (targetRes.includes('480')) renderScale = 480 / 1080;
    else if (targetRes.includes('360')) renderScale = 360 / 1080;
    let prompt = args.find(arg => !arg.startsWith('--')) || "Create a short educational script about Space. Format as JSON having a root object with exactly 3 keys: 'video_title' (catchy title), 'viral_caption' (instagram caption with emojis and hashtags), and 'scenes' (array of scenes). Each scene must have scene_id, visual_prompt (make sure to explicitly include '9:16 vertical portrait format' in every prompt), hindi_content, and hinglish_content fields. CRITICAL REQUIREMENT: hinglish_content MUST be the exact word-for-word phonetic english translation of hindi_content so they sync perfectly in audio.";

    if (isTrending) {
        console.log('Fetching trending GitHub repository for the script topic...');
        const github = new GitHubModule(process.env.GITHUB_TOKEN);
        const repos = await github.getTrending('', 7);
        
        const historyPath = path.join(__dirname, 'public', 'generated_repos.json');
        await fs.ensureDir(path.join(__dirname, 'public'));
        let generatedRepos = [];
        if (await fs.pathExists(historyPath)) {
            generatedRepos = await fs.readJson(historyPath);
        }

        let topRepo = null;
        if (repos && repos.length > 0) {
            for (const repo of repos) {
                if (!generatedRepos.includes(repo.fullName)) {
                    topRepo = repo;
                    break;
                }
            }
        }

        if (topRepo) {
            console.log(`🔥 Picked Top Trending Repo: ${topRepo.fullName}`);
            generatedRepos.push(topRepo.fullName);
            await fs.writeJson(historyPath, generatedRepos, { spaces: 2 });
            prompt = `Create a highly engaging 5-scene educational video script about the trending GitHub repository: ${topRepo.name}. Description: ${topRepo.description}. URL: ${topRepo.url}. Make it sound exciting! Format as JSON having a root object with exactly 3 keys: 'video_title' (catchy title), 'viral_caption' (instagram caption with emojis and hashtags), and 'scenes' (array of scenes). Each scene must have scene_id, visual_prompt (make sure to explicitly include '9:16 vertical portrait format' in every prompt), hindi_content, and hinglish_content fields. CRITICAL REQUIREMENT: hinglish_content MUST be the exact word-for-word phonetic english translation of hindi_content so they sync perfectly in audio.`;
        } else {
            console.log('⚠️ No FRESH trending repos found. Falling back to default prompt.');
        }
    }

    if (isLogin) {
        console.log('Opening browser for manual login...');
        await browserManager.manualLogin('https://chatgpt.com/');
        await browserManager.manualLogin('https://gemini.google.com/app');
        await browserManager.manualLogin('https://aistudio.google.com/app/home');
        console.log('Login complete. You can now run the generator.');
        process.exit(0);
    }

    // Dynamic import for ESM-only Remotion 4.x packages
    const { bundle } = await import('@remotion/bundler');
    const { renderMedia, selectComposition } = await import('@remotion/renderer');

    const publicDir = path.join(__dirname, 'public');
    const audioDir = path.join(publicDir, 'audio');
    const imagesDir = path.join(publicDir, 'images');
    const scriptPath = path.join(publicDir, 'final_script.json');

    await fs.ensureDir(audioDir);
    await fs.ensureDir(imagesDir);

    const chatgpt = new ChatGPTModule();
    let finalScript;

    if (isReuse) {
      console.log('♻️ Reuse mode enabled.');
      if (await fs.pathExists(scriptPath)) {
        finalScript = await fs.readJson(scriptPath);
        console.log('✅ Loaded existing script.');
      }
    }

    if (!finalScript) {
      console.log('🚀 Starting AI Scrapper Video Maker (Browser Edition)');
      
      finalScript = await retry(async () => {
          let result = await chatgpt.generateScript(prompt);
          
          // If ChatGPT returns a direct array, wrap it in an object
          if (Array.isArray(result)) {
              result = { scenes: result };
          }
          
          if (!result || typeof result !== 'object' || !result.scenes || !Array.isArray(result.scenes)) {
             console.error("\n[Error] Invalid response from ChatGPT. Expected a JSON with a 'scenes' array.\nGot:", result);
             throw new Error("ChatGPT script is invalid or not fully formatted as JSON. Retrying...");
          }
          return result;
      });
      
      await fs.writeJson(scriptPath, finalScript, { spaces: 2 });
      console.log('💾 Script saved.');
    }

    console.log('Switching to Vanilla Chrome to prevent Google endpoints 403 blocks...');
    await browserManager.relaunchAsVanilla();

    const googleStudio = new GoogleStudioModule();
    const geminiWeb = new GeminiWebModule();

    const scenesWithAssets = [];

    for (const scene of finalScript.scenes) {
      const audioPath = path.join(audioDir, `scene_${scene.scene_id}.mp3`);
      const imagePath = path.join(imagesDir, `scene_${scene.scene_id}.png`);

      if (!await fs.pathExists(audioPath) || !isReuse) {
        console.log(`Generating Audio for Scene ${scene.scene_id}...`);
        await retry(async () => {
            if (useElevenLabs) {
                const tts = new TTSModule(process.env.ELEVENLABS_API_KEY);
                await tts.generateHindiVoice(scene.hindi_content, audioPath);
            } else {
                await googleStudio.generateAudio(scene.hindi_content, audioPath);
            }
        });
      }

      if (!await fs.pathExists(imagePath) || !isReuse) {
        console.log(`Generating Image for Scene ${scene.scene_id}...`);
        try {
            await retry(async () => {
                await geminiWeb.generateImage(scene.visual_prompt, imagePath);
            });
        } catch (geminiError) {
            console.log(`⚠️ Gemini failed after 3 attempts: ${geminiError.message}`);
            console.log(`🔄 Falling back to ChatGPT DALLE-3 for Image Generation...`);
            await retry(async () => {
                await chatgpt.generateImage(scene.visual_prompt, imagePath);
            });
        }
      }

      const duration = await getAudioDuration(audioPath);
      
      scenesWithAssets.push({
        ...scene,
        audioPath: `audio/scene_${scene.scene_id || scene.id}.mp3`,
        imagePath: `images/scene_${scene.scene_id || scene.id}.png`,
        durationInFrames: Math.ceil(duration * 30) + 15, 
      });
    }

    console.log('🎬 Rendering video...');
    const entry = path.join(__dirname, 'src', 'remotion', 'index.jsx');
    const bundleLocation = await bundle(entry);
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: 'Reel',
      inputProps: { scenes: scenesWithAssets },
    });

    const outputLocation = path.join(__dirname, 'public', 'final_reel.mp4');

    if (!isReuse || !await fs.pathExists(outputLocation)) {
        console.log(`🎬 Rendering Video at Target Resolution: ${targetRes} (Scale factor: ${renderScale.toFixed(2)})`);
        await renderMedia({
          composition,
          serveUrl: bundleLocation,
          outputLocation,
          codec: 'h264',
          scale: renderScale,
          inputProps: { scenes: scenesWithAssets },
          onProgress: ({ progress }) => {
            console.log(`Rendering progress: ${Math.round(progress * 100)}%`);
          },
        });
    } else {
        console.log(`⏭️ Skipping rendering, reusing existing final_reel.mp4`);
    }

    console.log(`✅ Success! Video at: ${outputLocation}`);
    
    // Extract Caption and write to file
    const captionContent = `Title: ${finalScript.video_title || 'AI Scrapper Reel'}\n\n${finalScript.viral_caption || '#aivideo #reels #tech'}`;
    const captionPath = path.join(publicDir, 'caption.txt');
    await fs.writeFile(captionPath, captionContent);
    console.log('📝 Saved Instagram caption.txt');

    // Google Drive Upload Flow
    console.log('☁️ Initiating Google Drive Upload...');
    const drive = new GoogleDriveModule();
    await drive.init();
    
    // Find or create the root "INSTAGRAM_REELS" folder
    const rootFolderId = await drive.getOrCreateFolder('INSTAGRAM_REELS');
    
    // Create the timestamped specific subfolder
    const dateStr = new Date().toISOString().replace(/:/g, '-').split('.')[0]; // e.g. "2026-03-24T12-30-00"
    const safeTitle = (finalScript.video_title || 'Untitled_Reel').replace(/[^a-zA-Z0-9 -]/g, '');
    const folderName = `${dateStr} - ${safeTitle}`;
    
    const subFolderId = await drive.getOrCreateFolder(folderName, rootFolderId);
    
    // Upload files
    await drive.uploadFile(outputLocation, 'final_reel.mp4', subFolderId, 'video/mp4');
    await drive.uploadFile(captionPath, 'caption.txt', subFolderId, 'text/plain');

    console.log('🎉 Production Pipeline Completely Finished!');
    await browserManager.close();

  } catch (error) {
    console.error('❌ Error:', error);
    await browserManager.close();
    process.exit(1);
  }
}

main();


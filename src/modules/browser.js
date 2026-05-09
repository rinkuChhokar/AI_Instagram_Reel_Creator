const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs-extra');

puppeteer.use(StealthPlugin());

function getChromePath() {
    const paths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe'
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

class BrowserManager {
    constructor() {
        this.browser = null;
        this.userDataDir = path.join(__dirname, '../../.browser-data');
    }

    async init(headless = false, vanilla = false) {
        await fs.ensureDir(this.userDataDir);
        
        const launchOptions = {
            headless: headless ? 'new' : false,
            userDataDir: this.userDataDir,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--start-maximized'
            ],
            defaultViewport: null
        };

        const chromePath = getChromePath();
        if (chromePath) {
            launchOptions.executablePath = chromePath;
        }

        if (vanilla) {
            console.log('Launching Vanilla Chrome (Stealth disabled)...');
            const puppeteerVanilla = require('puppeteer-core');
            this.browser = await puppeteerVanilla.launch(launchOptions);
        } else {
            console.log('Launching Stealth Chrome...');
            this.browser = await puppeteer.launch(launchOptions);
        }
        
        return this.browser;
    }

    async relaunchAsVanilla() {
        if (this.browser) {
            await this.close();
            await new Promise(r => setTimeout(r, 2000)); // wait to ensure profile unlocks
        }
        await this.init(false, true);
    }

    async getPage() {
        if (!this.browser) await this.init();
        
        const newPage = await this.browser.newPage();
        
        // Close other pages to keep memory clean and prevent navigation conflicts
        const pages = await this.browser.pages();
        for (const page of pages) {
            if (page !== newPage) {
                await page.close().catch(() => {});
            }
        }
        
        return newPage;
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    /**
     * Helper for manual login
     * Opens headful browser for the user to log in
     */
    async manualLogin(url, vanilla = false) {
        if (this.browser) await this.close();
        await this.init(false, vanilla); // headful, vanilla mode passed down
        const page = await this.getPage();
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        } catch (e) {
            console.log('Navigation warning (can be ignored if page loaded):', e.message);
        }
        console.log(`Please log in to ${url} manually...`);
        console.log('Close the browser window once you are logged in.');
        
        return new Promise((resolve) => {
            this.browser.on('disconnected', resolve);
        });
    }
}

module.exports = new BrowserManager();

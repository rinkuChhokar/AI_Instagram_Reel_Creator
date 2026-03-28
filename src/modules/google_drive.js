const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

class GoogleDriveModule {
  async init(credentialsPath = 'credentials.json', tokenPath = 'token.json') {
    const resolvedPath = path.resolve(process.cwd(), credentialsPath);
    const resolvedTokenPath = path.resolve(process.cwd(), tokenPath);
    
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Google Drive Error: OAuth Credentials file not found at ${resolvedPath}.\nPlease download your OAuth 2.0 Client ID JSON from Google Cloud Console and save it as credentials.json!`);
    }
    
    const content = fs.readFileSync(resolvedPath, 'utf8');
    const credentials = JSON.parse(content);
    
    // Support both installed and web app credentials
    const authKeys = credentials.installed || credentials.web;
    if (!authKeys) {
        throw new Error("Invalid credentials.json format. Make sure you downloaded an OAuth 2.0 Client ID (Desktop Application type).");
    }

    const { client_secret, client_id, redirect_uris } = authKeys;
    // Fallback to out-of-band if no valid redirects exist
    const redirectUri = (redirect_uris && redirect_uris.length > 0) ? redirect_uris[0] : 'urn:ietf:wg:oauth:2.0:oob';
    
    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirectUri
    );

    // Check if we have previously stored a token.
    if (fs.existsSync(resolvedTokenPath)) {
      const token = fs.readFileSync(resolvedTokenPath, 'utf8');
      oAuth2Client.setCredentials(JSON.parse(token));
    } else {
      await this.getAccessToken(oAuth2Client, resolvedTokenPath);
    }
    
    this.drive = google.drive({ version: 'v3', auth: oAuth2Client });
  }

  getAccessToken(oAuth2Client, tokenPath) {
    return new Promise((resolve, reject) => {
      const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        // Request deep drive scope so we can fully manage the INSTAGRAM_REELS environment
        scope: ['https://www.googleapis.com/auth/drive'],
      });
      console.log('\n=============================================');
      console.log('🛑 Google Drive Authentication Required 🛑');
      console.log('=============================================');
      console.log('Authorize this script by visiting this url:');
      console.log(authUrl);
      console.log('=============================================\n');
      
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      
      rl.question('Paste the authorization code from that page here: ', (code) => {
        rl.close();
        if (!code || code.trim() === '') {
            return reject(new Error("No authorization code provided."));
        }
        oAuth2Client.getToken(code.trim(), (err, token) => {
          if (err) {
            console.error('Error retrieving access token', err);
            return reject(err);
          }
          oAuth2Client.setCredentials(token);
          // Store the token to disk for later program executions
          fs.writeFileSync(tokenPath, JSON.stringify(token));
          console.log(`[Drive] Token securely stored to ${tokenPath}!`);
          resolve(oAuth2Client);
        });
      });
    });
  }

  async getOrCreateFolder(folderName, parentId = null) {
    console.log(`[Drive] Scanning for folder: ${folderName}...`);
    let query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    
    if (parentId) {
      query += ` and '${parentId}' in parents`;
    }

    const res = await this.drive.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive',
    });
    
    if (res.data.files && res.data.files.length > 0) {
      console.log(`[Drive] ✅ Found existing folder: ${folderName}`);
      return res.data.files[0].id;
    }
    
    console.log(`[Drive] 🔨 Creating new folder: ${folderName}...`);
    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };
    if (parentId) {
      fileMetadata.parents = [parentId];
    }
    
    const folder = await this.drive.files.create({
      resource: fileMetadata,
      fields: 'id',
    });
    
    return folder.data.id;
  }

  async uploadFile(localFilePath, targetFileName, parentId, mimeType) {
    console.log(`[Drive] ⬆️ Uploading ${targetFileName}...`);
    const fileMetadata = {
      name: targetFileName,
      parents: [parentId]
    };
    
    const media = {
      mimeType: mimeType,
      body: fs.createReadStream(localFilePath),
    };
    
    const file = await this.drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id',
    });
    
    console.log(`[Drive] ☁️ Uploaded successfully!`);
    return file.data.id;
  }
}

module.exports = GoogleDriveModule;

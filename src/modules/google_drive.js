const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

class GoogleDriveModule {
  async init(credentialsPath = 'credentials.json', tokenPath = 'token.json') {
    const resolvedPath = path.resolve(process.cwd(), credentialsPath);
    this.resolvedTokenPath = path.resolve(process.cwd(), tokenPath);
    
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
    
    this.oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirectUri
    );

    // Load existing token or run interactive auth flow
    if (fs.existsSync(this.resolvedTokenPath)) {
      const token = JSON.parse(fs.readFileSync(this.resolvedTokenPath, 'utf8'));
      this.oAuth2Client.setCredentials(token);

      // Proactively check if token is expired or has no refresh_token
      const isExpired = token.expiry_date && token.expiry_date < Date.now();
      const hasRefresh = !!token.refresh_token;
      if (isExpired && !hasRefresh) {
        console.warn('[Drive] ⚠️  Token is expired and has no refresh_token. Re-authorizing...');
        fs.unlinkSync(this.resolvedTokenPath);
        await this.getAccessToken(this.oAuth2Client, this.resolvedTokenPath);
      }
    } else {
      await this.getAccessToken(this.oAuth2Client, this.resolvedTokenPath);
    }
    
    this.drive = google.drive({ version: 'v3', auth: this.oAuth2Client });
  }

  // Wraps a Drive API call — if invalid_grant fires, wipes token and re-auths automatically
  async _withAuthRetry(fn) {
    try {
      return await fn();
    } catch (err) {
      const isInvalidGrant = err?.response?.data?.error === 'invalid_grant' ||
                             err?.message?.includes('invalid_grant');
      if (isInvalidGrant) {
        console.warn('\n[Drive] 🔑 Token expired/revoked (invalid_grant). Deleting stale token and re-authorizing...');
        if (fs.existsSync(this.resolvedTokenPath)) {
          fs.unlinkSync(this.resolvedTokenPath);
        }
        await this.getAccessToken(this.oAuth2Client, this.resolvedTokenPath);
        this.drive = google.drive({ version: 'v3', auth: this.oAuth2Client });
        // Retry once with the new token
        return await fn();
      }
      throw err;
    }
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
    return this._withAuthRetry(async () => {
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
    });
  }

  async uploadFile(localFilePath, targetFileName, parentId, mimeType) {
    return this._withAuthRetry(async () => {
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
    });
  }
}

module.exports = GoogleDriveModule;

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs/promises';
import path from 'path';
import { authenticate } from '@google-cloud/local-auth';
import http from 'http';
import url from 'url';
import crypto from 'crypto';

const TOKEN_PATH = path.join(process.cwd(), 'tokens.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

export class AuthManager {
  private static instance: AuthManager;
  private authClient: OAuth2Client | null = null;

  private readonly SCOPES = [
    'https://www.googleapis.com/auth/classroom.courses.readonly',
    'https://www.googleapis.com/auth/classroom.announcements.readonly',
    'https://www.googleapis.com/auth/classroom.coursework.students.readonly',
    'https://www.googleapis.com/auth/classroom.coursework.students',
    'https://www.googleapis.com/auth/classroom.rosters.readonly',
    'https://www.googleapis.com/auth/classroom.announcements',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/drive.file',
  ];

  private constructor() {}

  static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  async authenticateAndSaveCredentials(): Promise<OAuth2Client> {
    console.error('Starting authentication process...');

    try {
      await fs.access(CREDENTIALS_PATH);
    } catch {
      throw new Error(
        'credentials.json not found. Please download OAuth 2.0 credentials from Google Cloud Console and save as credentials.json'
      );
    }

    // Load credentials
    const credentialsContent = await fs.readFile(CREDENTIALS_PATH, 'utf8');
    const credentials = JSON.parse(credentialsContent).web;

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      credentials.client_id,
      credentials.client_secret,
      credentials.redirect_uris[0]
    );

    // Generate auth URL
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.SCOPES,
      prompt: 'consent',
    });

    console.log('\n📋 Please visit this URL to authorize the application:');
    console.log('\n' + authUrl + '\n');

    // Create local server to handle callback
    const auth = await this.waitForAuthorizationCode(oauth2Client, credentials.redirect_uris[0]);

    await fs.writeFile(TOKEN_PATH, JSON.stringify(auth.credentials));
    console.error('Authentication successful, credentials saved to tokens.json');

    this.authClient = auth;
    this.setupTokenRefreshHandler(auth);

    return auth;
  }

  private async waitForAuthorizationCode(oauth2Client: OAuth2Client, redirectUri: string): Promise<OAuth2Client> {
    return new Promise((resolve, reject) => {
      const parsedUrl = url.parse(redirectUri);
      const port = parsedUrl.port || 3000;

      const server = http.createServer(async (req, res) => {
        try {
          if (req.url && req.url.indexOf('/auth/google/callback') > -1) {
            const qs = new url.URL(req.url, `http://localhost:${port}`).searchParams;
            const code = qs.get('code');

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<html><body><h1>Authentication successful!</h1><p>You can close this window and return to the terminal.</p></body></html>');

            server.close();

            if (code) {
              const { tokens } = await oauth2Client.getToken(code);
              oauth2Client.setCredentials(tokens);
              resolve(oauth2Client);
            } else {
              reject(new Error('No authorization code received'));
            }
          }
        } catch (e) {
          reject(e);
        }
      });

      server.listen(port, () => {
        console.log(`Waiting for authorization callback on http://localhost:${port}/auth/google/callback`);
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error('Authentication timeout - no response received within 5 minutes'));
      }, 5 * 60 * 1000);
    });
  }

  async getAuthClient(): Promise<OAuth2Client> {
    if (this.authClient) {
      // Check if token needs refresh (expires in less than 5 minutes)
      const credentials = this.authClient.credentials;
      if (credentials.expiry_date) {
        const now = Date.now();
        const expiresIn = credentials.expiry_date - now;
        
        // If token expires in less than 5 minutes, refresh it proactively
        if (expiresIn < 5 * 60 * 1000) {
          console.log('Token expiring soon, refreshing proactively...');
          try {
            await this.authClient.refreshAccessToken();
            // Save refreshed tokens
            const newTokens = this.authClient.credentials;
            await fs.writeFile(TOKEN_PATH, JSON.stringify(newTokens));
          } catch (error) {
            console.error('Failed to refresh token:', error);
            // Continue with existing token, it might still work
          }
        }
      }
      return this.authClient;
    }

    try {
      await fs.access(TOKEN_PATH);
    } catch {
      throw new Error(
        'Authentication required. Please run "npm run auth" to authenticate with Google Classroom.'
      );
    }

    const tokens = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf-8'));

    // Need to get client_id and client_secret from credentials.json
    const credentialsPath = './credentials.json';
    let clientId: string | undefined;
    let clientSecret: string | undefined;
    
    try {
      const credentialsContent = await fs.readFile(credentialsPath, 'utf-8');
      const credentials = JSON.parse(credentialsContent).web;
      clientId = credentials.client_id;
      clientSecret = credentials.client_secret;
    } catch (error) {
      console.error('Warning: Could not read credentials.json for client ID/secret');
    }

    const auth = new google.auth.OAuth2(
      clientId,
      clientSecret,
      'http://localhost:3000/auth/google/callback'
    );
    auth.setCredentials(tokens);

    this.setupTokenRefreshHandler(auth);
    this.authClient = auth;

    return auth;
  }

  private setupTokenRefreshHandler(auth: OAuth2Client): void {
    auth.on('tokens', async (tokens) => {
      console.error('Refreshing authentication tokens...');

      try {
        const existingCredentials = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf-8'));

        if (tokens.refresh_token) {
          existingCredentials.refresh_token = tokens.refresh_token;
        }

        if (tokens.access_token) {
          existingCredentials.access_token = tokens.access_token;
          existingCredentials.expiry_date = tokens.expiry_date;
        }

        await fs.writeFile(TOKEN_PATH, JSON.stringify(existingCredentials));
        console.error('Tokens refreshed and saved successfully');
      } catch (error) {
        console.error('Error saving refreshed tokens:', error);
      }
    });
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      await fs.access(TOKEN_PATH);
      return true;
    } catch {
      return false;
    }
  }

  async clearCredentials(): Promise<void> {
    try {
      await fs.unlink(TOKEN_PATH);
      this.authClient = null;
      console.error('Credentials cleared successfully');
    } catch (error) {
      console.error('Error clearing credentials:', error);
    }
  }
}
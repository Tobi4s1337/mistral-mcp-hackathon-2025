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

// Check for environment variables first
const GOOGLE_TOKENS = process.env.GOOGLE_TOKENS;
const GOOGLE_CREDENTIALS = process.env.GOOGLE_CREDENTIALS;

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

    let credentialsContent: string;
    
    // Try environment variable first, then file
    if (GOOGLE_CREDENTIALS) {
      credentialsContent = GOOGLE_CREDENTIALS;
    } else {
      try {
        await fs.access(CREDENTIALS_PATH);
        credentialsContent = await fs.readFile(CREDENTIALS_PATH, 'utf8');
      } catch {
        throw new Error(
          'Google credentials not found. Set GOOGLE_CREDENTIALS env variable or save credentials.json file'
        );
      }
    }

    // Load credentials
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

    // Save tokens to file if not using env variable
    if (!GOOGLE_TOKENS) {
      await fs.writeFile(TOKEN_PATH, JSON.stringify(auth.credentials));
      console.error('Authentication successful, credentials saved to tokens.json');
    } else {
      console.error('Authentication successful! Add this to your environment variables:');
      console.error('GOOGLE_TOKENS=' + JSON.stringify(auth.credentials));
    }

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
            // Save refreshed tokens only if using file storage
            if (!GOOGLE_TOKENS) {
              const newTokens = this.authClient.credentials;
              await fs.writeFile(TOKEN_PATH, JSON.stringify(newTokens));
            }
          } catch (error) {
            console.error('Failed to refresh token:', error);
            // Continue with existing token, it might still work
          }
        }
      }
      return this.authClient;
    }

    let tokens: any;
    
    // Try environment variable first, then file
    if (GOOGLE_TOKENS) {
      try {
        tokens = JSON.parse(GOOGLE_TOKENS);
      } catch (error) {
        throw new Error('Invalid GOOGLE_TOKENS environment variable. Must be valid JSON.');
      }
    } else {
      try {
        await fs.access(TOKEN_PATH);
        tokens = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf-8'));
      } catch {
        throw new Error(
          'Authentication required. Set GOOGLE_TOKENS env variable or run "npm run auth" to authenticate.'
        );
      }
    }

    // Get client_id and client_secret from env variable or file
    let clientId: string | undefined;
    let clientSecret: string | undefined;
    let redirectUri: string | undefined;
    
    if (GOOGLE_CREDENTIALS) {
      try {
        const credentials = JSON.parse(GOOGLE_CREDENTIALS).web;
        clientId = credentials.client_id;
        clientSecret = credentials.client_secret;
        redirectUri = credentials.redirect_uris?.[0] || 'http://localhost:3000/auth/google/callback';
      } catch (error) {
        console.error('Warning: Could not parse GOOGLE_CREDENTIALS env variable');
      }
    } else {
      try {
        const credentialsContent = await fs.readFile(CREDENTIALS_PATH, 'utf-8');
        const credentials = JSON.parse(credentialsContent).web;
        clientId = credentials.client_id;
        clientSecret = credentials.client_secret;
        redirectUri = credentials.redirect_uris?.[0] || 'http://localhost:3000/auth/google/callback';
      } catch (error) {
        console.error('Warning: Could not read credentials for client ID/secret');
      }
    }

    const auth = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri || 'http://localhost:3000/auth/google/callback'
    );
    auth.setCredentials(tokens);

    this.setupTokenRefreshHandler(auth);
    this.authClient = auth;

    return auth;
  }

  private setupTokenRefreshHandler(auth: OAuth2Client): void {
    auth.on('tokens', async (tokens) => {
      console.error('Refreshing authentication tokens...');

      // Only save to file if not using environment variable
      if (!GOOGLE_TOKENS) {
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
      } else {
        console.error('Tokens refreshed (using env variable, not persisting to file)');
      }
    });
  }

  async isAuthenticated(): Promise<boolean> {
    // Check env variable first
    if (GOOGLE_TOKENS) {
      try {
        JSON.parse(GOOGLE_TOKENS);
        return true;
      } catch {
        return false;
      }
    }
    
    // Then check file
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
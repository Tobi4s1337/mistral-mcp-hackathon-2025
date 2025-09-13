import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs/promises';
import path from 'path';
import { authenticate } from '@google-cloud/local-auth';

const TOKEN_PATH = path.join(process.cwd(), 'tokens.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

export class AuthManager {
  private static instance: AuthManager;
  private authClient: OAuth2Client | null = null;

  private readonly SCOPES = [
    'https://www.googleapis.com/auth/classroom.courses.readonly',
    'https://www.googleapis.com/auth/classroom.announcements.readonly',
    'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
    'https://www.googleapis.com/auth/classroom.coursework.students',
    'https://www.googleapis.com/auth/classroom.rosters.readonly',
    'https://www.googleapis.com/auth/classroom.announcements',
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

    const auth = await authenticate({
      keyfilePath: CREDENTIALS_PATH,
      scopes: this.SCOPES,
    });

    await fs.writeFile(TOKEN_PATH, JSON.stringify(auth.credentials));
    console.error('Authentication successful, credentials saved to tokens.json');

    this.authClient = auth;
    this.setupTokenRefreshHandler(auth);

    return auth;
  }

  async getAuthClient(): Promise<OAuth2Client> {
    if (this.authClient) {
      return this.authClient;
    }

    try {
      await fs.access(TOKEN_PATH);
    } catch {
      throw new Error(
        'Authentication required. Please run "npm run auth" to authenticate with Google Classroom.'
      );
    }

    const credentials = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf-8'));

    const auth = new google.auth.OAuth2();
    auth.setCredentials(credentials);

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
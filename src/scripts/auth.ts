#!/usr/bin/env node

import { AuthManager } from '../classroom/auth/authManager.js';
import fs from 'fs/promises';
import path from 'path';

async function main() {
  console.log('🔐 Google Classroom Authentication Setup');
  console.log('========================================\n');

  const credentialsPath = path.join(process.cwd(), 'credentials.json');

  try {
    await fs.access(credentialsPath);
    console.log('✅ Found credentials.json');
  } catch {
    console.error('❌ credentials.json not found!');
    console.error('\nPlease follow these steps:');
    console.error('1. Go to Google Cloud Console (https://console.cloud.google.com)');
    console.error('2. Create a new project or select an existing one');
    console.error('3. Enable the Google Classroom API');
    console.error('4. Create OAuth 2.0 credentials (Web application type)');
    console.error('5. Add http://localhost:3000/auth/google/callback to redirect URIs');
    console.error('6. Download the credentials and save as credentials.json in the project root');
    process.exit(1);
  }

  const authManager = AuthManager.getInstance();

  try {
    const isAuthenticated = await authManager.isAuthenticated();

    if (isAuthenticated) {
      console.log('\n⚠️  Authentication tokens already exist.');
      console.log('Do you want to re-authenticate? This will override existing tokens.');
      console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    console.log('🚀 Starting OAuth authentication flow...');
    console.log('The authorization URL will be displayed below.\n');

    await authManager.authenticateAndSaveCredentials();

    console.log('\n✅ Authentication successful!');
    console.log('Tokens have been saved to tokens.json');
    console.log('\nYou can now use the Google Classroom MCP tools.');
    console.log('The MCP server will automatically use these credentials.');

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Authentication failed:', error.message);
    console.error('\nTroubleshooting tips:');
    console.error('1. Ensure your Google account has access to Google Classroom');
    console.error('2. Check that the OAuth consent screen is configured properly');
    console.error('3. If your app is in testing mode, add your email as a test user');
    console.error('4. Verify all required scopes are enabled in Google Cloud Console');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
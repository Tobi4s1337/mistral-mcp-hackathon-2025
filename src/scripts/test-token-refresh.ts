#!/usr/bin/env node

import { AuthManager } from "../classroom/auth/authManager.js";
import fs from "fs/promises";
import path from "path";

const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  bold: "\x1b[1m"
};

async function testTokenRefresh() {
  console.log(`${colors.bold}${colors.blue}🔐 Testing Token Refresh Logic${colors.reset}\n`);

  try {
    const authManager = AuthManager.getInstance();
    
    // Get current auth client
    console.log(`${colors.cyan}Getting auth client...${colors.reset}`);
    const authClient = await authManager.getAuthClient();
    
    // Check current token status
    const credentials = authClient.credentials;
    console.log(`\n${colors.yellow}Current Token Status:${colors.reset}`);
    
    if (credentials.access_token) {
      console.log(`  ${colors.green}✓${colors.reset} Access token present`);
      console.log(`  ${colors.dim}Token (first 20 chars): ${credentials.access_token.substring(0, 20)}...${colors.reset}`);
    } else {
      console.log(`  ${colors.red}✗${colors.reset} No access token found`);
    }
    
    if (credentials.refresh_token) {
      console.log(`  ${colors.green}✓${colors.reset} Refresh token present`);
      console.log(`  ${colors.dim}Refresh token (first 20 chars): ${credentials.refresh_token.substring(0, 20)}...${colors.reset}`);
    } else {
      console.log(`  ${colors.yellow}⚠${colors.reset} No refresh token found (might cause issues later)`);
    }
    
    if (credentials.expiry_date) {
      const now = Date.now();
      const expiryDate = new Date(credentials.expiry_date);
      const expiresIn = credentials.expiry_date - now;
      const expiresInMinutes = Math.floor(expiresIn / 1000 / 60);
      const expiresInSeconds = Math.floor((expiresIn / 1000) % 60);
      
      console.log(`  ${colors.dim}Expires at: ${expiryDate.toLocaleString()}${colors.reset}`);
      
      if (expiresIn > 0) {
        console.log(`  ${colors.green}✓${colors.reset} Token valid for: ${expiresInMinutes}m ${expiresInSeconds}s`);
        
        if (expiresIn < 5 * 60 * 1000) {
          console.log(`  ${colors.yellow}⚠${colors.reset} Token expires soon (less than 5 minutes)`);
        }
      } else {
        console.log(`  ${colors.red}✗${colors.reset} Token expired ${Math.abs(expiresInMinutes)}m ${Math.abs(expiresInSeconds)}s ago`);
      }
    } else {
      console.log(`  ${colors.yellow}⚠${colors.reset} No expiry date found`);
    }
    
    // Test forcing a refresh
    console.log(`\n${colors.cyan}Testing token refresh...${colors.reset}`);
    
    try {
      console.log(`  Attempting to refresh token...`);
      const oldToken = credentials.access_token;
      
      // Force refresh
      await authClient.refreshAccessToken();
      
      const newCredentials = authClient.credentials;
      
      if (newCredentials.access_token !== oldToken) {
        console.log(`  ${colors.green}✓${colors.reset} Token refreshed successfully!`);
        console.log(`  ${colors.dim}New token (first 20 chars): ${newCredentials.access_token?.substring(0, 20)}...${colors.reset}`);
        
        if (newCredentials.expiry_date) {
          const newExpiryDate = new Date(newCredentials.expiry_date);
          console.log(`  ${colors.dim}New expiry: ${newExpiryDate.toLocaleString()}${colors.reset}`);
        }
        
        // Save the refreshed token
        const tokenPath = path.join(process.cwd(), 'tokens.json');
        await fs.writeFile(tokenPath, JSON.stringify(newCredentials, null, 2));
        console.log(`  ${colors.green}✓${colors.reset} Refreshed token saved to tokens.json`);
      } else {
        console.log(`  ${colors.yellow}⚠${colors.reset} Token unchanged (might have been too recent)`);
      }
      
    } catch (error: any) {
      console.log(`  ${colors.red}✗${colors.reset} Failed to refresh token: ${error.message}`);
      
      if (error.message.includes('invalid_grant')) {
        console.log(`\n${colors.red}${colors.bold}Token refresh failed - refresh token might be invalid or expired${colors.reset}`);
        console.log(`You may need to re-authenticate by running: ${colors.cyan}npm run auth${colors.reset}`);
      }
    }
    
    // Test making an API call
    console.log(`\n${colors.cyan}Testing API call with current token...${colors.reset}`);
    
    try {
      const { google } = await import('googleapis');
      const classroom = google.classroom({
        version: 'v1',
        auth: authClient,
      });
      
      const response = await classroom.courses.list({
        pageSize: 1,
        courseStates: ['ACTIVE'],
      });
      
      console.log(`  ${colors.green}✓${colors.reset} API call successful!`);
      
      if (response.data.courses && response.data.courses.length > 0) {
        console.log(`  ${colors.dim}Found course: ${response.data.courses[0].name}${colors.reset}`);
      }
    } catch (error: any) {
      console.log(`  ${colors.red}✗${colors.reset} API call failed: ${error.message}`);
    }
    
    console.log(`\n${colors.green}${colors.bold}✅ Token refresh test complete!${colors.reset}`);
    
  } catch (error: any) {
    console.error(`\n${colors.red}${colors.bold}Error during token test:${colors.reset}`, error);
    
    if (error.message.includes('Authentication required')) {
      console.log(`\n${colors.yellow}Please run ${colors.cyan}npm run auth${colors.reset} first to authenticate.`);
    }
  }
}

// Run the test
testTokenRefresh().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});
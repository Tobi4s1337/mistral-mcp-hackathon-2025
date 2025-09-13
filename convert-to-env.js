#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('Converting Google authentication files to environment variables...\n');

const convertToEnv = () => {
  const envLines = [];
  
  // Check and convert credentials.json
  const credentialsPath = path.join(process.cwd(), 'credentials.json');
  if (fs.existsSync(credentialsPath)) {
    const credentials = fs.readFileSync(credentialsPath, 'utf-8');
    // Minify JSON and escape for shell
    const minified = JSON.stringify(JSON.parse(credentials));
    envLines.push(`GOOGLE_CREDENTIALS='${minified}'`);
    console.log('✅ Found credentials.json');
  } else {
    console.log('⚠️  credentials.json not found');
  }
  
  // Check and convert tokens.json
  const tokensPath = path.join(process.cwd(), 'tokens.json');
  if (fs.existsSync(tokensPath)) {
    const tokens = fs.readFileSync(tokensPath, 'utf-8');
    // Minify JSON and escape for shell
    const minified = JSON.stringify(JSON.parse(tokens));
    envLines.push(`GOOGLE_TOKENS='${minified}'`);
    console.log('✅ Found tokens.json');
  } else {
    console.log('⚠️  tokens.json not found');
  }
  
  if (envLines.length > 0) {
    console.log('\n📋 Add these lines to your .env file or set as environment variables:\n');
    console.log('-------------------');
    envLines.forEach(line => console.log(line));
    console.log('-------------------');
    
    // Also save to a file for convenience
    const outputPath = path.join(process.cwd(), 'google-env-vars.txt');
    fs.writeFileSync(outputPath, envLines.join('\n'));
    console.log(`\n💾 Environment variables also saved to: ${outputPath}`);
    console.log('\n⚠️  Security note: These contain sensitive credentials. Handle with care!');
    console.log('🔒 For production, use a secure secrets management system.');
  } else {
    console.log('\n❌ No Google authentication files found to convert.');
    console.log('   Run "npm run auth" first to generate authentication files.');
  }
};

convertToEnv();
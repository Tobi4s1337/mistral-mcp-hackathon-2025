/**
 * Bria AI Service - Singleton instance management
 */

import { BriaClient } from './client.js';
import type { BriaConfig } from './types.js';

let briaClient: BriaClient | null = null;

/**
 * Initialize the Bria client with configuration
 */
export function initializeBriaClient(config: BriaConfig): BriaClient {
  briaClient = new BriaClient(config);
  return briaClient;
}

/**
 * Get the Bria client instance
 */
export function getBriaClient(): BriaClient {
  if (!briaClient) {
    // Try to initialize with environment variable if available
    const apiKey = process.env.BRIA_API_KEY;
    if (!apiKey) {
      throw new Error('Bria client not initialized. Please provide BRIA_API_KEY environment variable.');
    }
    briaClient = new BriaClient({ apiKey });
  }
  return briaClient;
}
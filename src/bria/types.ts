/**
 * Types for Bria AI Image Generation API
 */

export interface BriaImageGenerationOptions {
  prompt: string;
  num_results?: number;
  aspect_ratio?: '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9';
  sync?: boolean;
  seed?: number;
  negative_prompt?: string;
  steps_num?: number;
  text_guidance_scale?: number;
  medium?: 'photography' | 'art';
  prompt_enhancement?: boolean;
  enhance_image?: boolean;
  prompt_content_moderation?: boolean;
  content_moderation?: boolean;
  ip_signal?: boolean;
}

export interface BriaImageResult {
  seed: number;
  urls: string[];
  uuid: string;
}

export interface BriaBlockedResult {
  blocked: boolean;
  error_code: string;
  description: string;
}

export interface BriaApiResponse {
  result?: (BriaImageResult | BriaBlockedResult)[];
  error_code?: string;
  description?: string;
}

export interface BriaConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModelVersion?: string;
}

export type BriaModelVersion = '2.3' | '3.2';
export type BriaGenerationType = 'base' | 'fast' | 'hd';
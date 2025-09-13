/**
 * Bria AI Image Generation Client
 */

import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type {
  BriaApiResponse,
  BriaConfig,
  BriaGenerationType,
  BriaImageGenerationOptions,
  BriaImageResult,
  BriaModelVersion,
} from './types.js';

export class BriaClient {
  private readonly axiosInstance: AxiosInstance;
  private readonly apiKey: string;
  private readonly defaultModelVersion: BriaModelVersion;

  constructor(config: BriaConfig) {
    this.apiKey = config.apiKey;
    this.defaultModelVersion = (config.defaultModelVersion as BriaModelVersion) || '3.2';
    
    this.axiosInstance = axios.create({
      baseURL: config.baseUrl || 'https://engine.prod.bria-api.com/v1',
      headers: {
        'api_token': this.apiKey,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Generate an image using Bria AI
   * @param options Image generation options
   * @param type Generation type (base, fast, hd)
   * @param modelVersion Model version to use
   * @returns Array of image URLs
   */
  async generateImage(
    options: BriaImageGenerationOptions,
    type: BriaGenerationType = 'base',
    modelVersion?: BriaModelVersion
  ): Promise<string[]> {
    const version = modelVersion || this.defaultModelVersion;
    
    // Validate model version for different generation types
    const validVersions: Record<BriaGenerationType, BriaModelVersion[]> = {
      base: ['2.3', '3.2'],
      fast: ['2.3'],
      hd: ['2.2'] as any, // HD uses 2.2 which isn't in our type
    };

    // For HD, we need to use 2.2
    const actualVersion = type === 'hd' ? '2.2' : version;
    
    const endpoint = `/text-to-image/${type}/${actualVersion}`;
    
    try {
      const requestBody = {
        prompt: options.prompt,
        num_results: options.num_results || 1,
        aspect_ratio: options.aspect_ratio || '1:1',
        sync: options.sync !== false, // Default to true for synchronous
        seed: options.seed,
        negative_prompt: options.negative_prompt,
        steps_num: options.steps_num,
        text_guidance_scale: options.text_guidance_scale,
        medium: options.medium,
        prompt_enhancement: options.prompt_enhancement || false,
        enhance_image: options.enhance_image || false,
        prompt_content_moderation: options.prompt_content_moderation !== false, // Default to true
        content_moderation: options.content_moderation || false,
        ip_signal: options.ip_signal || false,
      };

      // Remove undefined values
      Object.keys(requestBody).forEach(key => {
        if (requestBody[key as keyof typeof requestBody] === undefined) {
          delete requestBody[key as keyof typeof requestBody];
        }
      });

      const response = await this.axiosInstance.post<BriaApiResponse>(endpoint, requestBody);
      
      // Check if it's an error response
      if (response.data.error_code) {
        throw new Error(`Bria API Error ${response.data.error_code}: ${response.data.description}`);
      }

      // Extract URLs from successful results
      const urls: string[] = [];
      if (response.data.result) {
        for (const result of response.data.result) {
          if ('urls' in result && result.urls) {
            urls.push(...result.urls);
          } else if ('blocked' in result && result.blocked) {
            console.warn(`Image blocked: ${result.description}`);
          }
        }
      }

      if (urls.length === 0) {
        throw new Error('No images were generated successfully');
      }

      return urls;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data?.description || error.message;
        throw new Error(`Failed to generate image: ${errorMessage}`);
      }
      throw error;
    }
  }

  /**
   * Generate a single image with a simple interface
   * @param prompt The text prompt
   * @param aspectRatio Optional aspect ratio
   * @returns URL of the generated image
   */
  async generateSingleImage(
    prompt: string,
    aspectRatio?: BriaImageGenerationOptions['aspect_ratio']
  ): Promise<string> {
    const urls = await this.generateImage({
      prompt,
      num_results: 1,
      aspect_ratio: aspectRatio,
      sync: true,
    });

    if (urls.length === 0) {
      throw new Error('No image was generated');
    }

    return urls[0];
  }

  /**
   * Generate motivational images for students
   * @param prompt The motivational message or theme
   * @param style The visual style (photography or art)
   * @returns URL of the generated image
   */
  async generateMotivationalImage(
    prompt: string,
    style: 'photography' | 'art' = 'art'
  ): Promise<string> {
    // Enhance the prompt for motivational content
    const enhancedPrompt = `Inspirational and motivational ${style === 'art' ? 'illustration' : 'photograph'}: ${prompt}. Uplifting, positive, educational atmosphere, bright colors, encouraging mood`;

    const urls = await this.generateImage({
      prompt: enhancedPrompt,
      num_results: 1,
      aspect_ratio: '16:9', // Good for presentations
      medium: style,
      prompt_enhancement: true,
      enhance_image: true,
      sync: true,
    });

    if (urls.length === 0) {
      throw new Error('No motivational image was generated');
    }

    return urls[0];
  }

  /**
   * Enhance a prompt for better image generation
   * @param prompt The original prompt
   * @returns Enhanced prompt
   */
  async enhancePrompt(prompt: string): Promise<string> {
    try {
      const response = await this.axiosInstance.post('/prompt_enhancer', {
        prompt,
      });

      // Handle different response formats
      if (typeof response.data.results === 'string') {
        return response.data.results;
      } else if (response.data.results && response.data.results['prompt variations']) {
        return response.data.results['prompt variations'];
      } else if (response.data.results) {
        return JSON.stringify(response.data.results);
      }
      
      return prompt;
    } catch (error) {
      console.error('Failed to enhance prompt:', error);
      return prompt; // Return original if enhancement fails
    }
  }
}
import { Mistral } from "@mistralai/mistralai";
import { z } from "zod";
import fs from "fs";

const MistralModelSchema = z.enum([
  "mistral-tiny",
  "mistral-small",
  "mistral-medium-latest",
  "mistral-large",
  "mistral-embed"
]);

type MistralModel = z.infer<typeof MistralModelSchema>;

export interface OCROptions {
  model?: "mistral-ocr-latest";
  includeImageBase64?: boolean;
}

export interface OCRResult {
  content?: string;
  images?: Array<{
    bbox?: number[];
    base64?: string;
  }>;
  metadata?: Record<string, any>;
}

export interface FileUploadResult {
  id: string;
  object: string;
  bytes: number;
  createdAt: number;
  filename: string;
  purpose: string;
  sample_type?: string;
  source?: string;
  deleted?: boolean;
  num_lines?: number | null;
}

export interface MistralCompletionOptions {
  model?: MistralModel;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  systemPrompt?: string;
  responseFormat?: "text" | "json";
}

class MistralClient {
  private client: Mistral;
  private defaultModel: MistralModel = "mistral-medium-latest";

  constructor() {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      throw new Error("Missing MISTRAL_API_KEY environment variable");
    }
    this.client = new Mistral({ apiKey });
  }

  async complete(
    prompt: string,
    options: MistralCompletionOptions = {}
  ): Promise<string> {
    const {
      model = this.defaultModel,
      temperature = 0.7,
      maxTokens = 4000,
      topP = 1,
      systemPrompt,
      responseFormat = "text"
    } = options;

    const messages = [];

    if (systemPrompt) {
      messages.push({ role: "system" as const, content: systemPrompt });
    }

    messages.push({ role: "user" as const, content: prompt });

    try {
      const response = await this.client.chat.complete({
        model,
        messages: messages as any,
        temperature,
        maxTokens,
        topP,
        ...(responseFormat === "json" && { responseFormat: { type: "json_object" } })
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content || typeof content !== 'string') {
        throw new Error("No response content from Mistral API");
      }

      return content;
    } catch (error) {
      console.error("Mistral API error:", error);
      throw new Error(`Mistral completion failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async completeWithJSON<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    options: MistralCompletionOptions = {}
  ): Promise<T> {
    const response = await this.complete(prompt, {
      ...options,
      responseFormat: "json"
    });

    try {
      const parsed = JSON.parse(response);
      return schema.parse(parsed);
    } catch (error) {
      console.error("Failed to parse JSON response:", error);
      throw new Error("Invalid JSON response from Mistral");
    }
  }

  async streamComplete(
    prompt: string,
    options: MistralCompletionOptions = {},
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const {
      model = this.defaultModel,
      temperature = 0.7,
      maxTokens = 4000,
      topP = 1,
      systemPrompt
    } = options;

    const messages = [];

    if (systemPrompt) {
      messages.push({ role: "system" as const, content: systemPrompt });
    }

    messages.push({ role: "user" as const, content: prompt });

    try {
      const stream = await this.client.chat.stream({
        model,
        messages: messages as any,
        temperature,
        maxTokens,
        topP
      });

      for await (const chunk of stream) {
        const content = chunk.data?.choices?.[0]?.delta?.content;
        if (content && typeof content === 'string') {
          onChunk(content);
        }
      }
    } catch (error) {
      console.error("Mistral streaming error:", error);
      throw new Error(`Mistral streaming failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async processOCR(
    documentUrl: string,
    options: OCROptions = {}
  ): Promise<OCRResult> {
    const {
      model = "mistral-ocr-latest",
      includeImageBase64 = true
    } = options;

    try {
      const response = await this.client.ocr.process({
        model,
        document: {
          type: "document_url",
          documentUrl
        },
        includeImageBase64
      });

      return response as OCRResult;
    } catch (error) {
      console.error("OCR processing error:", error);
      throw new Error(`OCR processing failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async processOCRFromBase64(
    base64Pdf: string,
    options: OCROptions = {}
  ): Promise<OCRResult> {
    const {
      model = "mistral-ocr-latest",
      includeImageBase64 = true
    } = options;

    try {
      const response = await this.client.ocr.process({
        model,
        document: {
          type: "document_url",
          documentUrl: `data:application/pdf;base64,${base64Pdf}`
        },
        includeImageBase64
      });

      return response as OCRResult;
    } catch (error) {
      console.error("OCR processing error:", error);
      throw new Error(`OCR processing failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async processOCRFromFile(
    filePath: string,
    options: OCROptions = {}
  ): Promise<OCRResult> {
    try {
      const pdfBuffer = fs.readFileSync(filePath);
      const base64Pdf = pdfBuffer.toString('base64');
      return this.processOCRFromBase64(base64Pdf, options);
    } catch (error) {
      console.error("File reading error:", error);
      throw new Error(`Failed to read PDF file: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async uploadPDF(
    filePath: string,
    fileName?: string
  ): Promise<FileUploadResult> {
    try {
      const content = fs.readFileSync(filePath);
      const name = fileName || filePath.split('/').pop() || 'document.pdf';

      const response = await this.client.files.upload({
        file: {
          fileName: name,
          content
        },
        purpose: "ocr"
      });

      return {
        id: response.id,
        object: response.object,
        bytes: (response as any).bytes || response.sizeBytes,
        createdAt: response.createdAt,
        filename: response.filename,
        purpose: response.purpose,
        sample_type: response.sampleType,
        source: response.source,
        deleted: (response as any).deleted,
        num_lines: response.numLines
      } as FileUploadResult;
    } catch (error) {
      console.error("PDF upload error:", error);
      throw new Error(`PDF upload failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async retrieveFile(fileId: string): Promise<any> {
    try {
      const response = await this.client.files.retrieve({
        fileId
      });
      return response;
    } catch (error) {
      console.error("File retrieval error:", error);
      throw new Error(`File retrieval failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async getSignedUrl(fileId: string): Promise<string> {
    try {
      const response = await this.client.files.getSignedUrl({
        fileId
      });
      return response.url || (response as any).signedUrl || response.toString();
    } catch (error) {
      console.error("Signed URL error:", error);
      throw new Error(`Failed to get signed URL: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
}

export const mistralClient = new MistralClient();
export type { MistralModel };
export { MistralModelSchema };
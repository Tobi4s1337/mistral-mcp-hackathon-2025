import { ChatMistralAI } from "@langchain/mistralai";
import { z } from "zod";
import type { ZodSchema } from "zod";

export class LangChainMistralClient {
  private client: ChatMistralAI;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.MISTRAL_API_KEY;
    if (!key) {
      throw new Error("MISTRAL_API_KEY is required");
    }

    this.client = new ChatMistralAI({
      apiKey: key,
      model: "mistral-small-latest",
      temperature: 0.7,
    });
  }

  async generateWithStructuredOutput<T extends ZodSchema>(
    prompt: string,
    schema: T,
    options?: {
      systemPrompt?: string;
      model?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<z.infer<T>> {
    // Create a new client with the specified model if provided
    const model = options?.model || "mistral-small-latest";
    const temperature = options?.temperature ?? 0.7;

    const clientForRequest = new ChatMistralAI({
      apiKey: this.client.apiKey,
      model,
      temperature,
      maxTokens: options?.maxTokens || 4000,
    });

    // Use withStructuredOutput to bind the schema
    // Try using function calling instead of json_mode for better reliability
    const modelWithStructure = clientForRequest.withStructuredOutput(schema);

    // Build the full prompt
    const messages: any[] = [];

    if (options?.systemPrompt) {
      messages.push({
        role: "system",
        content: options.systemPrompt
      });
    }

    messages.push({
      role: "human",
      content: prompt
    });

    try {
      // Invoke the model with structured output
      const result = await modelWithStructure.invoke(messages);
      return result as z.infer<T>;
    } catch (error) {
      console.error("LangChain Mistral error:", error);
      throw new Error(`Failed to generate structured output: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async generateText(
    prompt: string,
    options?: {
      systemPrompt?: string;
      model?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<string> {
    const model = options?.model || "mistral-small-latest";
    const temperature = options?.temperature ?? 0.3;

    const clientForRequest = new ChatMistralAI({
      apiKey: this.client.apiKey,
      model,
      temperature,
      maxTokens: options?.maxTokens || 2000,
    });

    const messages: any[] = [];

    if (options?.systemPrompt) {
      messages.push({
        role: "system",
        content: options.systemPrompt
      });
    }

    messages.push({
      role: "human",
      content: prompt
    });

    try {
      const result = await clientForRequest.invoke(messages);
      return result.content as string;
    } catch (error) {
      console.error("LangChain Mistral text generation error:", error);
      throw new Error(`Failed to generate text: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
}

// Create a singleton instance lazily
let _instance: LangChainMistralClient | null = null;

export const getLangchainMistralClient = (): LangChainMistralClient => {
  if (!_instance) {
    _instance = new LangChainMistralClient();
  }
  return _instance;
};
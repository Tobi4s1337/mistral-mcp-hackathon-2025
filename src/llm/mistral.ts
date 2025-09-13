import { Mistral } from "@mistralai/mistralai";
import { z } from "zod";

const MistralModelSchema = z.enum([
  "mistral-tiny",
  "mistral-small",
  "mistral-medium-latest",
  "mistral-large",
  "mistral-embed"
]);

type MistralModel = z.infer<typeof MistralModelSchema>;

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
}

export const mistralClient = new MistralClient();
export type { MistralModel };
export { MistralModelSchema };
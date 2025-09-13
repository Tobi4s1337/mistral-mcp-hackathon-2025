import { z } from "zod";

export const WorksheetSettingsSchema = z.object({
  language: z.string().default("English (US)"),
  ageGroup: z.enum(["3 - 5", "6 - 7", "8 - 9", "10 - 12", "13 - 15", "16+", "auto"]).default("auto"),
  complexity: z.number().min(0).max(3).default(0),
  sectionCount: z.union([z.string(), z.number()]).default("3-4"),
  activityTypes: z.union([
    z.literal("automatic"),
    z.array(z.enum([
      "fill-blanks",
      "short-answer",
      "multiple-choice",
      "true-false",
      "matching",
      "vocabulary",
      "calculations",
      "sequencing",
      "essay",
      "tables",
      "word-problems"
    ]))
  ]).default("automatic"),
  includeAnswerKey: z.boolean().default(true)
});

export type WorksheetSettings = z.infer<typeof WorksheetSettingsSchema>;

export const WorksheetResponseSchema = z.object({
  title: z.string().min(1, { message: "Worksheet title cannot be empty" }),
  subject: z.string(),
  gradeLevel: z.string(),
  content: z.string().min(20, { message: "Content must be at least 20 characters long" })
});

export type WorksheetResponse = z.infer<typeof WorksheetResponseSchema>;

export interface WorksheetGenerationRequest {
  prompt: string;
  settings?: Partial<WorksheetSettings>;
  attachments?: Array<{
    type: string;
    content: string;
  }>;
}

export interface WorksheetResult {
  id?: string;
  title: string;
  subject: string;
  gradeLevel: string;
  content: string;
  answerKey?: string;
  pdfUrl?: string;
  meta: {
    settings: WorksheetSettings;
    createdAt: Date;
  };
}

export interface AgeGroupMapping {
  gradeLevel: string;
  complexity: string;
  characteristics: string;
}

export const ActivityTypeDescriptions: Record<string, string> = {
  "fill-blanks": "Fill in the blanks - Complete sentences with missing words",
  "short-answer": "Short answer questions - 1-3 sentence responses",
  "multiple-choice": "Multiple choice - Select from given options",
  "true-false": "True/False statements - Evaluate accuracy",
  "matching": "Matching - Connect related items",
  "vocabulary": "Vocabulary exercises - Word meanings and usage",
  "calculations": "Math problems - Show your work",
  "sequencing": "Put items in correct order",
  "essay": "Extended response questions",
  "tables": "Complete or analyze tables/charts",
  "word-problems": "Real-world application problems"
};
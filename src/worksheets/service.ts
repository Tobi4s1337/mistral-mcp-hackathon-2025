import { z } from "zod";
import { mistralClient } from "../llm/mistral.js";
import {
  WorksheetResponseSchema,
  ActivityTypeDescriptions,
  WorksheetSettingsSchema
} from "./types.js";
import type {
  WorksheetSettings,
  WorksheetResponse,
  WorksheetGenerationRequest,
  WorksheetResult,
  AgeGroupMapping
} from "./types.js";

export class WorksheetService {
  private getAgeGroupMapping(ageGroup: string): AgeGroupMapping {
    const mappings: Record<string, AgeGroupMapping> = {
      "3 - 5": {
        gradeLevel: "Pre-K to Kindergarten",
        complexity: "very simple",
        characteristics: "Large fonts, simple instructions, visual elements, tracing activities, minimal writing"
      },
      "6 - 7": {
        gradeLevel: "1st-2nd Grade",
        complexity: "simple",
        characteristics: "Basic vocabulary, clear instructions, more visuals, short responses, beginning reading"
      },
      "8 - 9": {
        gradeLevel: "3rd-4th Grade",
        complexity: "elementary",
        characteristics: "Moderate vocabulary, paragraph reading, multi-step problems, basic analysis"
      },
      "10 - 12": {
        gradeLevel: "5th-6th Grade",
        complexity: "intermediate",
        characteristics: "Advanced vocabulary, longer texts, critical thinking, problem-solving"
      },
      "13 - 15": {
        gradeLevel: "7th-9th Grade",
        complexity: "middle school",
        characteristics: "Complex concepts, analytical questions, extended responses, research skills"
      },
      "16+": {
        gradeLevel: "10th-12th Grade",
        complexity: "high school",
        characteristics: "Advanced analysis, essay questions, complex problem-solving, synthesis"
      },
      "auto": {
        gradeLevel: "Mixed",
        complexity: "adaptive",
        characteristics: "Content-appropriate complexity"
      }
    };
    return mappings[ageGroup] || mappings["auto"];
  }

  private getActivityTypeDescriptions(
    activityTypes: WorksheetSettings["activityTypes"],
    ageGroup: string
  ): string {
    if (activityTypes === "automatic") {
      const youngAges = ["3 - 5", "6 - 7"];
      const middleAges = ["8 - 9", "10 - 12"];

      if (youngAges.includes(ageGroup)) {
        return "Fill in the blanks, Matching, True/False, Simple vocabulary, Basic sequencing";
      } else if (middleAges.includes(ageGroup)) {
        return "Fill in the blanks, Short answer questions, Multiple choice, Matching, Vocabulary, Basic calculations or word problems";
      } else {
        return "Short answer questions, Multiple choice, Essay questions, Tables/charts analysis, Complex word problems, Critical thinking exercises";
      }
    }

    if (Array.isArray(activityTypes)) {
      return activityTypes
        .map(type => ActivityTypeDescriptions[type])
        .filter(Boolean)
        .join(", ");
    }

    return Object.values(ActivityTypeDescriptions).join(", ");
  }

  private buildSystemPrompt(
    settings: WorksheetSettings,
    hasAttachments: boolean
  ): string {
    const ageMapping = this.getAgeGroupMapping(settings.ageGroup);
    const complexityLabels = ["automatic", "simple", "moderate", "advanced"];
    const complexity = complexityLabels[settings.complexity] || "automatic";

    let sectionCount = 3;
    if (typeof settings.sectionCount === "string" && settings.sectionCount.includes("-")) {
      const [min, max] = settings.sectionCount.split("-").map(n => parseInt(n));
      sectionCount = Math.floor((min + max) / 2);
    } else if (typeof settings.sectionCount === "number") {
      sectionCount = settings.sectionCount;
    }

    const activityTypesDesc = this.getActivityTypeDescriptions(settings.activityTypes, settings.ageGroup);

    return `You are an expert educational worksheet designer. Create a well-structured, printable worksheet that students can complete on paper. The worksheet should be formatted as clean HTML that renders beautifully.

🎯 WORKSHEET SPECIFICATIONS:
- Target Age: ${settings.ageGroup} (${ageMapping.gradeLevel})
- Complexity: ${complexity}
- Language: ${settings.language}
- Number of Sections: ${typeof settings.sectionCount === "string" ? settings.sectionCount : sectionCount}
- Characteristics: ${ageMapping.characteristics}
- Activity types: ${activityTypesDesc}
${hasAttachments ? "IMPORTANT: Use the provided file(s) as the primary content source for the worksheet." : ""}

📋 WORKSHEET STRUCTURE:

Create ${sectionCount} distinct sections with educational content. DO NOT include a header with name/date/class fields.

FORMATTING GUIDELINES:

Use clean HTML with inline styles. Here are the formats for different activity types:

**Fill in the Blanks:**
<p>The capital of France is _______________.</p>

**Short Answer:**
<div style="margin-bottom: 12px;">
  <p style="font-size: 13px; margin-bottom: 4px;"><strong>1.</strong> Explain why plants need sunlight.</p>
  <div style="margin-left: 15px;">
    <p style="border-bottom: 1px solid #666; min-height: 20px; line-height: 20px; margin: 4px 0;">&nbsp;</p>
    <p style="border-bottom: 1px solid #666; min-height: 20px; line-height: 20px; margin: 4px 0;">&nbsp;</p>
  </div>
</div>

**Multiple Choice:**
<div style="margin-bottom: 10px;">
  <p style="font-size: 13px; margin-bottom: 3px;"><strong>2.</strong> Which planet is the Red Planet?</p>
  <div style="padding-left: 20px; font-size: 12px;">
    <p style="margin: 2px 0;">A) Venus</p>
    <p style="margin: 2px 0;">B) Mars</p>
    <p style="margin: 2px 0;">C) Jupiter</p>
    <p style="margin: 2px 0;">D) Saturn</p>
  </div>
</div>

**True/False:**
<p style="font-size: 13px;"><strong>3.</strong> The Earth revolves around the Sun. _____ T / F</p>

**Math Problems:**
<div style="margin-bottom: 12px;">
  <p style="font-size: 13px;"><strong>4.</strong> Solve: 234 × 56</p>
  <div style="border: 1px solid #999; min-height: 60px; padding: 8px; margin-left: 15px;">
    <p style="font-size: 10px; color: #666;">Show work:</p>
  </div>
</div>

OUTPUT REQUIREMENTS:
Return a JSON object with these exact fields:
{
  "title": "Clear, descriptive worksheet title",
  "subject": "Subject area (e.g., Math, Science, English)",
  "gradeLevel": "Grade level (e.g., 4th Grade, High School)",
  "content": "Complete HTML content of the worksheet. NO answer keys or solutions."
}

IMPORTANT:
- Create exactly ${sectionCount} sections
- Use age-appropriate content for ${ageMapping.gradeLevel}
- All content in ${settings.language}
- DO NOT include any answer key or solutions
- Keep HTML clean and printable`;
  }

  async generateWorksheet(request: WorksheetGenerationRequest): Promise<WorksheetResult> {
    const settings = WorksheetSettingsSchema.parse({
      ...WorksheetSettingsSchema.parse({}),
      ...request.settings
    });

    const systemPrompt = this.buildSystemPrompt(
      settings,
      !!(request.attachments && request.attachments.length > 0)
    );

    let userPrompt = request.prompt;
    if (request.attachments && request.attachments.length > 0) {
      userPrompt += "\n\nAttached content:\n";
      request.attachments.forEach((attachment, index) => {
        userPrompt += `\n[Attachment ${index + 1}]:\n${attachment.content}\n`;
      });
    }

    try {
      const response = await mistralClient.completeWithJSON(
        userPrompt,
        WorksheetResponseSchema,
        {
          systemPrompt,
          model: "mistral-medium-latest",
          temperature: 0.7,
          maxTokens: 8000,
          responseFormat: "json"
        }
      );

      const answerKey = settings.includeAnswerKey
        ? await this.generateAnswerKey(response, settings)
        : undefined;

      return {
        title: response.title,
        subject: response.subject,
        gradeLevel: response.gradeLevel,
        content: response.content,
        answerKey,
        meta: {
          settings,
          createdAt: new Date()
        }
      };
    } catch (error) {
      console.error("Worksheet generation error:", error);
      throw new Error(`Failed to generate worksheet: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private async generateAnswerKey(
    worksheet: WorksheetResponse,
    settings: WorksheetSettings
  ): Promise<string> {
    const prompt = `Based on this worksheet, generate a complete answer key with all correct answers and solutions.

Worksheet Title: ${worksheet.title}
Subject: ${worksheet.subject}
Grade Level: ${worksheet.gradeLevel}

Worksheet Content:
${worksheet.content}

Provide clear, accurate answers for all questions. For math problems, show the work. Format the answer key in clean HTML similar to the worksheet style.`;

    try {
      const answerKey = await mistralClient.complete(prompt, {
        model: "mistral-medium-latest",
        temperature: 0.3,
        maxTokens: 4000
      });

      return `<h2>Answer Key - ${worksheet.title}</h2>\n${answerKey}`;
    } catch (error) {
      console.error("Answer key generation error:", error);
      return "";
    }
  }

  async generateAlternativeVersion(
    original: WorksheetResult,
    modifications?: Partial<WorksheetSettings>
  ): Promise<WorksheetResult> {
    const newSettings = {
      ...original.meta.settings,
      ...modifications
    };

    const prompt = `Create an alternative version of this worksheet with similar learning objectives but different questions and examples.

Original Worksheet:
Title: ${original.title}
Subject: ${original.subject}
Grade Level: ${original.gradeLevel}

Keep the same structure and learning goals but use entirely different examples, numbers, and scenarios.`;

    return this.generateWorksheet({
      prompt,
      settings: newSettings,
      attachments: [{
        type: "original",
        content: original.content
      }]
    });
  }

  async gradeWorksheet(
    worksheetContent: string,
    studentAnswers: string,
    rubric?: string
  ): Promise<{
    score: number;
    feedback: string;
    detailedGrading: Array<{
      question: string;
      answer: string;
      correct: boolean;
      feedback: string;
    }>;
  }> {
    const prompt = `Grade this student's worksheet submission and provide detailed feedback.

Worksheet:
${worksheetContent}

Student Answers:
${studentAnswers}

${rubric ? `Grading Rubric:\n${rubric}` : "Use standard grading practices."}

Provide:
1. Overall score (0-100)
2. General feedback
3. Question-by-question grading with specific feedback

Return as JSON with this structure:
{
  "score": number,
  "feedback": "overall feedback",
  "detailedGrading": [
    {
      "question": "question text",
      "answer": "student's answer",
      "correct": boolean,
      "feedback": "specific feedback"
    }
  ]
}`;

    const GradingSchema = z.object({
      score: z.number().min(0).max(100),
      feedback: z.string(),
      detailedGrading: z.array(z.object({
        question: z.string(),
        answer: z.string(),
        correct: z.boolean(),
        feedback: z.string()
      }))
    });

    try {
      return await mistralClient.completeWithJSON(prompt, GradingSchema, {
        model: "mistral-medium-latest",
        temperature: 0.3,
        responseFormat: "json"
      });
    } catch (error) {
      console.error("Grading error:", error);
      throw new Error(`Failed to grade worksheet: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
}

export const worksheetService = new WorksheetService();
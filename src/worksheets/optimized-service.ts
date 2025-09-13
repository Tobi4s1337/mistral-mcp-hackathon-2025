import { z } from "zod";
import { getLangchainMistralClient } from "../llm/langchain-mistral.js";
import { WORKSHEET_TEMPLATE, CSS_CLASS_REFERENCE } from "./template.js";
import { pdfExportService } from "./pdf.js";
import { WorksheetStorageManager } from "../classroom/storage/worksheetStorageManager.js";

const WorksheetOutputSchema = z.object({
  title: z.string().describe("The title of the worksheet"),
  subject: z.string().describe("The subject area (e.g., Math, Science, English)"),
  grade: z.string().describe("The grade level (e.g., 3rd Grade, High School)"),
  html: z.string().describe("The HTML body content using only predefined CSS classes"),
  summary: z.string().describe("A 2-3 sentence summary of the worksheet content and learning objectives")
});

export class OptimizedWorksheetService {
  private worksheetStorage = WorksheetStorageManager.getInstance();
  private buildSystemPrompt(): string {
    return `You are an expert educational worksheet creator. Generate ONLY the HTML body content for a worksheet using predefined CSS classes.

CRITICAL RULES:
1. Output ONLY a JSON object with: title, subject, grade, html, summary
2. The html field contains ONLY section content - NO titles, NO h1, NO worksheet name
3. Start DIRECTLY with <div class="ws-section"> elements
4. Use ONLY predefined CSS classes - NO inline styles
5. The title/subject/grade go in JSON fields, NOT in the HTML

AVAILABLE CSS CLASSES:

STRUCTURE (DO NOT use ws-title or ws-subtitle - those are added automatically):
- ws-section: Section wrapper
- ws-section-title: Section heading
- ws-instructions: Instructions text
- q-item: Question container
- q-num: Question number (e.g., <span class="q-num">1.</span>)
- q-text: Question text

ACTIVITY TYPES:

Fill in the Blanks:
<p class="q-text">The capital is <span class="fill-blank"></span></p>

Short Answer (2 lines):
<div class="q-item">
  <span class="q-num">1.</span>
  <span class="q-text">Question here?</span>
  <div class="answer-lines-2">
    <div class="answer-line"></div>
    <div class="answer-line"></div>
  </div>
</div>

Multiple Choice:
<div class="q-item">
  <span class="q-num">2.</span>
  <span class="q-text">Question?</span>
  <div class="mc-options">
    <div class="mc-option"><span class="mc-circle"></span><span class="mc-letter">A)</span> Option 1</div>
    <div class="mc-option"><span class="mc-circle"></span><span class="mc-letter">B)</span> Option 2</div>
  </div>
</div>

True/False:
<div class="q-item">
  <span class="q-num">3.</span>
  <span class="q-text">Statement here</span>
  <span class="tf-options">
    <span class="tf-circle"></span> T
    <span class="tf-circle"></span> F
  </span>
</div>

Math Problem:
<div class="q-item">
  <span class="q-num">4.</span>
  <span class="q-text">234 × 56 = ?</span>
  <div class="math-box">
    <span class="show-work-label">Show your work:</span>
  </div>
</div>

Table:
<table class="ws-table">
  <tr><th>Header 1</th><th>Header 2</th></tr>
  <tr><td>Data</td><td class="blank"></td></tr>
</table>

Matching:
<div class="match-container">
  <div class="match-column">
    <div class="match-item match-left">Item 1</div>
  </div>
  <div class="match-column">
    <div class="match-item match-right" data-letter="A">Match A</div>
  </div>
</div>

Essay:
<div class="q-item">
  <span class="q-num">5.</span>
  <span class="q-text">Essay question?</span>
  <div class="essay-box">
    <div class="essay-lines"></div>
  </div>
</div>

Word Problem:
<div class="word-problem">
  <span class="q-num">6.</span>
  <div class="word-problem-text">Problem description...</div>
  <div class="solution-space"></div>
</div>

CORRECT EXAMPLE OF EXPECTED JSON OUTPUT:
{
  "title": "3rd Grade Multiplication Practice",
  "subject": "Math",
  "grade": "3rd Grade",
  "html": "<div class=\"ws-section\">\n  <h2 class=\"ws-section-title\">Section 1: Basic Multiplication</h2>\n  <p class=\"ws-instructions\">Solve these multiplication problems.</p>\n  <div class=\"q-item\">\n    <span class=\"q-num\">1.</span>\n    <span class=\"q-text\">2 × 3 = <span class=\"fill-blank\"></span></span>\n  </div>\n  <div class=\"q-item\">\n    <span class=\"q-num\">2.</span>\n    <span class=\"q-text\">4 × 5 = <span class=\"fill-blank\"></span></span>\n  </div>\n</div>\n<div class=\"ws-section\">\n  <h2 class=\"ws-section-title\">Section 2: Word Problems</h2>\n  <p class=\"ws-instructions\">Read and solve.</p>\n  <div class=\"word-problem\">\n    <span class=\"q-num\">3.</span>\n    <div class=\"word-problem-text\">If you have 3 bags with 4 apples each, how many apples total?</div>\n    <div class=\"solution-space\"></div>\n  </div>\n</div>",
  "summary": "This worksheet helps 3rd graders practice basic multiplication facts and word problems. Students will solve 20 problems to build multiplication fluency."
}

CRITICAL RULES FOR THE HTML FIELD:
1. Must start with <div class="ws-section"> - NO <h1>, NO title tags before it
2. The html field contains ONLY section divs with questions inside
3. Title goes in the "title" field, NOT in the HTML
4. NO markdown backticks or code blocks in the output
5. Include 15-25 questions across multiple sections`;
  }

  async generateWorksheet(prompt: string): Promise<{
    html: string;
    title: string;
    subject: string;
    grade: string;
    summary: string;
  }> {
    const systemPrompt = this.buildSystemPrompt();

    const userPrompt = `Create a comprehensive educational worksheet based on this request:

${prompt}

FOLLOW THE EXAMPLE FORMAT EXACTLY:
- Return a JSON object with fields: title, subject, grade, html, summary
- The 'html' field must start with <div class="ws-section">
- DO NOT put any <h1> or title tags in the HTML - put the title in the 'title' field instead
- Look at the example provided in the system prompt and follow that exact structure
- The HTML should be ONLY section divs with questions inside them
- Include 15-25 varied questions/activities across multiple sections`;

    try {
      const response = await getLangchainMistralClient().generateWithStructuredOutput(
        userPrompt,
        WorksheetOutputSchema,
        {
          systemPrompt,
          model: "mistral-small-latest",
          temperature: 0.7,
          maxTokens: 4000
        }
      );

      // Aggressively clean the HTML to remove any title tags that shouldn't be there
      let cleanedHtml = response.html;

      // Remove any h1 tags (with or without classes)
      cleanedHtml = cleanedHtml.replace(/<h1[^>]*>.*?<\/h1>\s*/gi, '');
      // Remove any paragraphs with ws-subtitle class
      cleanedHtml = cleanedHtml.replace(/<p[^>]*class="ws-subtitle"[^>]*>.*?<\/p>\s*/gi, '');
      // Also check for any title element at the start
      if (cleanedHtml.trim().startsWith('<h1') || cleanedHtml.trim().startsWith('<p class="ws-subtitle"')) {
        // Find the first ws-section and start from there
        const sectionIndex = cleanedHtml.indexOf('<div class="ws-section">');
        if (sectionIndex > -1) {
          cleanedHtml = cleanedHtml.substring(sectionIndex);
        }
      }
      // Trim any leading/trailing whitespace
      cleanedHtml = cleanedHtml.trim();

      // Inject the cleaned HTML into the template with title and subtitle
      let fullHtml = WORKSHEET_TEMPLATE.replace('__WORKSHEET_TITLE__', response.title);
      fullHtml = fullHtml.replace('__WORKSHEET_SUBTITLE__', `${response.subject} | ${response.grade}`);
      fullHtml = fullHtml.replace('__WORKSHEET_CONTENT__', cleanedHtml);

      return {
        html: fullHtml,
        title: response.title,
        subject: response.subject,
        grade: response.grade,
        summary: response.summary
      };
    } catch (error) {
      console.error("Worksheet generation error:", error);
      throw new Error(`Failed to generate worksheet: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async generateWorksheetWithPDF(prompt: string, generateAnswerKey: boolean = true): Promise<{
    html: string;
    title: string;
    subject: string;
    grade: string;
    summary: string;
    pdfUrl: string;
    answerKeyPdfUrl?: string;
    totalPoints?: number;
    gradingBreakdown?: Array<{ section: string; points: number; }>;
  }> {
    // Generate the worksheet
    const worksheet = await this.generateWorksheet(prompt);

    // Generate PDF and upload to S3
    const pdfResult = await pdfExportService.saveWorksheetAsPDF(
      worksheet.html,
      worksheet.title,
      { format: "Letter" },
      true // Always upload to S3
      // Removed metadata to avoid S3 header issues
    );

    let answerKeyPdfUrl: string | undefined;
    let totalPoints: number | undefined;
    let gradingBreakdown: Array<{ section: string; points: number; }> | undefined;

    if (generateAnswerKey) {
      try {
        // Generate answer key with grading info
        const answerKeyResult = await this.generateAnswerKey(worksheet.html, prompt);

        // Generate answer key PDF and upload to S3
        const answerKeyPdfResult = await pdfExportService.saveWorksheetAsPDF(
          answerKeyResult.html,
          `Answer Key - ${worksheet.title}`,
          { format: "Letter" },
          true // Always upload to S3
          // Removed metadata to avoid S3 header issues
        );

        answerKeyPdfUrl = answerKeyPdfResult.s3Url;
        totalPoints = answerKeyResult.totalPoints;
        gradingBreakdown = answerKeyResult.gradingBreakdown;
      } catch (error) {
        console.error("Answer key generation error:", error);
        // Continue without answer key if it fails
      }
    }

    if (!pdfResult.s3Url) {
      throw new Error("Failed to upload PDF to S3");
    }

    // Store worksheet information immediately
    if (answerKeyPdfUrl) {
      try {
        await this.worksheetStorage.addWorksheet(
          pdfResult.s3Url,
          answerKeyPdfUrl,
          worksheet.title,
          {
            subject: worksheet.subject,
            grade: worksheet.grade,
            summary: worksheet.summary,
            totalPoints,
            gradingBreakdown
          }
        );
        console.log('Stored worksheet data for future assignment creation');
      } catch (storageError) {
        console.error('Failed to store worksheet data:', storageError);
        // Continue even if storage fails
      }
    }

    return {
      html: worksheet.html,
      title: worksheet.title,
      subject: worksheet.subject,
      grade: worksheet.grade,
      summary: worksheet.summary,
      pdfUrl: pdfResult.s3Url,
      answerKeyPdfUrl,
      totalPoints,
      gradingBreakdown
    };
  }

  async generateAnswerKey(worksheetHtml: string, originalPrompt: string): Promise<{
    html: string;
    totalPoints: number;
    gradingBreakdown: Array<{ section: string; points: number; }>;
  }> {
    // Simplified approach - just generate the HTML answer key
    try {
      const prompt = `Generate an answer key for this worksheet. Output ONLY clean HTML with answers.

Original worksheet request: ${originalPrompt}

CRITICAL REQUIREMENTS:
- Output ONLY HTML sections with answers, no JSON wrapper
- Start directly with <div class="ws-section">
- NO markdown syntax (no triple backticks, no code blocks)
- Include answer for EVERY question
- Use <span class="bold"> for answers
- Add [5 pts] or similar after each question number

Example format:
<div class="ws-section">
  <h2 class="ws-section-title">Section 1 Answers</h2>
  <div class="q-item">
    <span class="q-num">1. [5 pts]</span>
    <span class="bold">Answer: 42</span>
  </div>
</div>`;

      const response = await getLangchainMistralClient().generateText(prompt, {
        model: "mistral-small-latest",
        temperature: 0.3,
        maxTokens: 3000
      });

      // Clean up the response
      let cleanHtml = response;

      // Remove any markdown artifacts
      cleanHtml = cleanHtml.replace(/```html?\s*/gi, '');
      cleanHtml = cleanHtml.replace(/```\s*/gi, '');

      // Remove any leading text before the first <div
      const divIndex = cleanHtml.indexOf('<div');
      if (divIndex > 0) {
        cleanHtml = cleanHtml.substring(divIndex);
      }

      // Trim whitespace
      cleanHtml = cleanHtml.trim();

      // Wrap in template
      let fullHtml = WORKSHEET_TEMPLATE.replace('__WORKSHEET_TITLE__', 'ANSWER KEY');
      fullHtml = fullHtml.replace('__WORKSHEET_SUBTITLE__', 'Complete Answer Guide');
      fullHtml = fullHtml.replace('__WORKSHEET_CONTENT__', cleanHtml);

      return {
        html: fullHtml,
        totalPoints: 100, // Default since we're not parsing it
        gradingBreakdown: []
      };
    } catch (error) {
      console.error("Answer key generation error:", error);
      // Return a basic fallback
      const fallbackHtml = WORKSHEET_TEMPLATE
        .replace('__WORKSHEET_TITLE__', 'ANSWER KEY')
        .replace('__WORKSHEET_SUBTITLE__', 'Generation Failed')
        .replace('__WORKSHEET_CONTENT__', '<p>Unable to generate answer key. Please create manually.</p>');

      return {
        html: fallbackHtml,
        totalPoints: 0,
        gradingBreakdown: []
      };
    }
  }

  private async generateSimpleAnswerKey(worksheetHtml: string, originalPrompt: string): Promise<string> {
    try {
      const prompt = `Generate answer key HTML for this worksheet. Output ONLY HTML sections with answers. No markdown, no explanations.

Worksheet request: ${originalPrompt}

Return HTML starting with <div class="ws-section"> with answers for each question.`;

      const response = await getLangchainMistralClient().generateText(prompt, {
        model: "mistral-small-latest",
        temperature: 0.3,
        maxTokens: 2000
      });

      // Clean up any markdown artifacts
      let cleanHtml = response.replace(/```html/g, '').replace(/```/g, '').trim();

      // Wrap in template
      let fullHtml = WORKSHEET_TEMPLATE.replace('__WORKSHEET_TITLE__', 'ANSWER KEY');
      fullHtml = fullHtml.replace('__WORKSHEET_SUBTITLE__', 'Grading information unavailable');
      fullHtml = fullHtml.replace('__WORKSHEET_CONTENT__', cleanHtml);

      return fullHtml;
    } catch (error) {
      console.error("Fallback answer key generation also failed:", error);
      const errorHtml = WORKSHEET_TEMPLATE
        .replace('__WORKSHEET_TITLE__', 'ANSWER KEY')
        .replace('__WORKSHEET_SUBTITLE__', 'Generation Failed')
        .replace('__WORKSHEET_CONTENT__', '<p>Unable to generate answer key. Please create manually.</p>');
      return errorHtml;
    }
  }
}

export const optimizedWorksheetService = new OptimizedWorksheetService();
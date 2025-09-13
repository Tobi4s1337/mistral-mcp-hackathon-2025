import { z } from "zod";
import { WorksheetStorageManager } from "../classroom/storage/worksheetStorageManager.js";
import { mistralClient } from "../llm/mistral.js";
import { getLangchainMistralClient } from "../llm/langchain-mistral.js";

const GradingResultSchema = z.object({
  overallScore: z.number().describe("Total score achieved out of total possible points"),
  totalPossiblePoints: z.number().describe("Total possible points for the worksheet"),
  percentageScore: z.number().describe("Percentage score (0-100)"),
  sectionScores: z.array(z.object({
    sectionName: z.string().describe("Name of the section"),
    pointsEarned: z.number().describe("Points earned in this section"),
    pointsPossible: z.number().describe("Total possible points for this section"),
    feedback: z.string().describe("Brief, constructive feedback for this section (1-2 sentences)")
  })).describe("Breakdown of scores by section"),
  overallFeedback: z.string().describe("Overall feedback on the submission (2-3 sentences)"),
  learningRecommendations: z.object({
    needsScaffolding: z.boolean().describe("Whether the student would benefit from additional support"),
    scaffoldingAreas: z.array(z.string()).describe("Specific areas where support is needed"),
    readyForAcceleration: z.boolean().describe("Whether the student is ready for more advanced material"),
    accelerationAreas: z.array(z.string()).describe("Specific areas where acceleration could be beneficial"),
    generalRecommendation: z.string().describe("General recommendation for next steps (1-2 sentences)")
  }).describe("Personalized learning recommendations")
});

export interface StudentSubmission {
  assignmentId: string;
  userName: string;
  userId: string;
  pdfUrl: string;
}

export interface GradingResult {
  userName: string;
  userId: string;
  assignmentId: string;
  submittedPdfUrl: string;
  gradedAt: string;
  overallScore: number;
  totalPossiblePoints: number;
  percentageScore: number;
  sectionScores: Array<{
    sectionName: string;
    pointsEarned: number;
    pointsPossible: number;
    feedback: string;
  }>;
  overallFeedback: string;
  learningRecommendations: {
    needsScaffolding: boolean;
    scaffoldingAreas: string[];
    readyForAcceleration: boolean;
    accelerationAreas: string[];
    generalRecommendation: string;
  };
}

export class GradingService {
  private worksheetStorage = WorksheetStorageManager.getInstance();

  async gradeStudentSubmission(submission: StudentSubmission): Promise<GradingResult> {
    const { assignmentId, userName, userId, pdfUrl } = submission;

    // Step 1: Get answer key and grading breakdown from storage
    const answerKeyHtml = await this.worksheetStorage.getAnswerKeyHtml(assignmentId);
    const gradingInfo = await this.worksheetStorage.getGradingInfo(assignmentId);
    
    if (!answerKeyHtml) {
      throw new Error(`No answer key found for assignment ${assignmentId}`);
    }

    if (!gradingInfo || !gradingInfo.totalPoints) {
      throw new Error(`No grading information found for assignment ${assignmentId}`);
    }

    // Step 2: Use OCR to extract content from student's PDF submission
    console.log(`Processing PDF submission from ${userName} (${userId})`);
    let studentWorkContent: string;
    
    try {
      let ocrResult;
      
      // Check if we have a file path (for file-based OCR) or URL
      if (pdfUrl.startsWith('file://')) {
        // Local file path
        const filePath = pdfUrl.replace('file://', '');
        console.log(`Using file-based OCR for ${userName}, file: ${filePath}`);
        ocrResult = await mistralClient.processOCRFromFile(filePath);
      } else if (pdfUrl.startsWith('data:application/pdf;base64,')) {
        // Extract base64 data from data URL
        const base64Data = pdfUrl.replace('data:application/pdf;base64,', '');
        console.log(`Using base64 OCR for ${userName}, data length: ${base64Data.length}`);
        ocrResult = await mistralClient.processOCRFromBase64(base64Data);
      } else if (pdfUrl.startsWith('http://') || pdfUrl.startsWith('https://')) {
        // Regular URL - including S3 URLs
        console.log(`Using URL OCR for ${userName}: ${pdfUrl}`);
        
        // For S3 URLs, we can use direct URL processing
        if (pdfUrl.includes('.s3.') || pdfUrl.includes('s3.amazonaws.com')) {
          console.log(`Processing S3 URL directly with OCR for ${userName}`);
          ocrResult = await mistralClient.processOCR(pdfUrl);
        } else {
          // For other URLs, use standard processing
          ocrResult = await mistralClient.processOCR(pdfUrl);
        }
      } else {
        // Unknown URL format
        console.warn(`Unknown URL format for ${userName}: ${pdfUrl}`);
        ocrResult = await mistralClient.processOCR(pdfUrl);
      }
      
      console.log(`OCR result for ${userName}:`, {
        hasContent: !!ocrResult.content,
        contentLength: ocrResult.content?.length || 0,
        contentPreview: ocrResult.content?.substring(0, 100)
      });
      
      studentWorkContent = ocrResult.content || "";
      
      if (!studentWorkContent || studentWorkContent.trim().length === 0) {
        // If OCR returns empty, provide a fallback response
        console.warn(`OCR returned empty content for ${userName}, using fallback`);
        studentWorkContent = "Unable to extract text from PDF. The document may be an image-only PDF or have formatting issues.";
      }
    } catch (error) {
      console.error("OCR processing error:", error);
      // Provide a fallback instead of failing completely
      console.warn(`OCR failed for ${userName}, using error fallback`);
      studentWorkContent = `OCR processing failed: ${error instanceof Error ? error.message : "Unknown error"}. Unable to extract submission content.`;
    }

    // Step 3: Grade the submission using LangChain Mistral
    const gradingPrompt = this.buildGradingPrompt(
      studentWorkContent,
      answerKeyHtml,
      gradingInfo,
      userName
    );

    try {
      const gradingResult = await getLangchainMistralClient().generateWithStructuredOutput(
        gradingPrompt,
        GradingResultSchema,
        {
          systemPrompt: this.buildSystemPrompt(),
          model: "mistral-small-latest",
          temperature: 0.3, // Lower temperature for more consistent grading
          maxTokens: 3000
        }
      );

      // Step 4: Compile and return the full grading result
      return {
        userName,
        userId,
        assignmentId,
        submittedPdfUrl: pdfUrl,
        gradedAt: new Date().toISOString(),
        overallScore: gradingResult.overallScore,
        totalPossiblePoints: gradingResult.totalPossiblePoints,
        percentageScore: gradingResult.percentageScore,
        sectionScores: gradingResult.sectionScores,
        overallFeedback: gradingResult.overallFeedback,
        learningRecommendations: gradingResult.learningRecommendations
      };
    } catch (error) {
      console.error("Grading error:", error);
      throw new Error(`Failed to grade submission: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private buildSystemPrompt(): string {
    return `You are an experienced educator grading student worksheets. Your role is to:

1. Compare student answers against the answer key
2. Award partial credit where appropriate
3. Provide constructive, encouraging feedback
4. Identify learning patterns and make recommendations

GRADING PRINCIPLES:
- Be fair and consistent
- Give partial credit for partially correct answers
- Recognize different valid approaches to problems
- Focus feedback on learning, not just correctness
- Be encouraging while being honest about areas for improvement

SCORING GUIDELINES:
- Full credit: Answer is correct or shows correct understanding
- 75% credit: Minor errors but correct approach
- 50% credit: Some understanding shown but significant errors
- 25% credit: Minimal understanding or effort shown
- 0% credit: No answer or completely incorrect

FEEDBACK STYLE:
- Keep section feedback to 1-2 sentences
- Be specific about what was done well and what needs improvement
- Use encouraging language
- Suggest specific strategies for improvement

LEARNING RECOMMENDATIONS:
- Identify patterns across sections
- Note if student consistently struggles with certain concepts (needs scaffolding)
- Note if student shows mastery and could handle more challenge (acceleration)
- Be specific about which areas need support or could be accelerated`;
  }

  private buildGradingPrompt(
    studentWork: string,
    answerKeyHtml: string,
    gradingInfo: { totalPoints: number | undefined; gradingBreakdown: Array<{ section: string; points: number; }> | undefined },
    studentName: string
  ): string {
    const breakdownText = gradingInfo.gradingBreakdown 
      ? gradingInfo.gradingBreakdown.map(s => `${s.section}: ${s.points} points`).join("\n")
      : `Total: ${gradingInfo.totalPoints} points`;

    return `Grade ${studentName}'s worksheet submission.

ANSWER KEY (HTML format):
${this.extractAnswersFromHtml(answerKeyHtml)}

GRADING BREAKDOWN:
Total Points: ${gradingInfo.totalPoints}
${breakdownText}

STUDENT'S SUBMITTED WORK (OCR extracted):
${studentWork}

TASK:
1. Compare each answer in the student's work to the answer key
2. Award points based on correctness and partial credit where appropriate
3. Calculate section scores based on the grading breakdown
4. Provide brief, constructive feedback for each section
5. Analyze overall performance patterns
6. Identify areas where the student needs additional support (scaffolding)
7. Identify areas where the student could handle more advanced material (acceleration)
8. Provide an overall recommendation for next steps

Return a structured grading result with scores, feedback, and learning recommendations.`;
  }

  private extractAnswersFromHtml(html: string): string {
    // Extract just the answer content from HTML for cleaner comparison
    // Remove HTML tags but keep the structure
    let cleanedContent = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove style tags
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script tags
      .replace(/<h1[^>]*>ANSWER KEY<\/h1>/gi, '') // Remove title
      .replace(/<[^>]+>/g, ' ') // Replace HTML tags with spaces
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    return cleanedContent;
  }

  async gradeMultipleSubmissions(submissions: StudentSubmission[]): Promise<GradingResult[]> {
    const results: GradingResult[] = [];
    
    for (const submission of submissions) {
      try {
        console.log(`Grading submission from ${submission.userName}...`);
        const result = await this.gradeStudentSubmission(submission);
        results.push(result);
        console.log(`Completed grading for ${submission.userName}: ${result.percentageScore}%`);
      } catch (error) {
        console.error(`Failed to grade submission from ${submission.userName}:`, error);
        // Create a failed grading result
        results.push({
          userName: submission.userName,
          userId: submission.userId,
          assignmentId: submission.assignmentId,
          submittedPdfUrl: submission.pdfUrl,
          gradedAt: new Date().toISOString(),
          overallScore: 0,
          totalPossiblePoints: 0,
          percentageScore: 0,
          sectionScores: [],
          overallFeedback: "Grading failed due to technical error. Please resubmit or contact your teacher.",
          learningRecommendations: {
            needsScaffolding: false,
            scaffoldingAreas: [],
            readyForAcceleration: false,
            accelerationAreas: [],
            generalRecommendation: "Unable to provide recommendations due to grading error."
          }
        });
      }
    }
    
    return results;
  }

  formatGradingReport(result: GradingResult): string {
    const sections = result.sectionScores.map(s => 
      `  ${s.sectionName}: ${s.pointsEarned}/${s.pointsPossible} points\n    Feedback: ${s.feedback}`
    ).join("\n\n");

    const scaffolding = result.learningRecommendations.needsScaffolding
      ? `\nAreas needing support: ${result.learningRecommendations.scaffoldingAreas.join(", ")}`
      : "";

    const acceleration = result.learningRecommendations.readyForAcceleration
      ? `\nReady for advancement in: ${result.learningRecommendations.accelerationAreas.join(", ")}`
      : "";

    return `
GRADING REPORT
==============
Student: ${result.userName} (${result.userId})
Assignment: ${result.assignmentId}
Submitted: ${result.submittedPdfUrl}
Graded: ${result.gradedAt}

OVERALL SCORE: ${result.overallScore}/${result.totalPossiblePoints} (${result.percentageScore}%)

SECTION BREAKDOWN:
${sections}

OVERALL FEEDBACK:
${result.overallFeedback}

LEARNING RECOMMENDATIONS:
${result.learningRecommendations.generalRecommendation}${scaffolding}${acceleration}
`;
  }
}

export const gradingService = new GradingService();
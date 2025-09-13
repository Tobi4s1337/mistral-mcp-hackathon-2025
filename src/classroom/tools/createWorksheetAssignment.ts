import { z } from 'zod';
import { ClassroomService } from '../services/classroomService.js';

export const createWorksheetAssignmentSchema = z.object({
  courseId: z.string().describe('The ID of the course to create the assignment in'),
  worksheetPdfUrl: z.string().describe('The URL of the worksheet PDF (must be publicly accessible or from S3)'),
  title: z.string().describe('The title of the assignment'),
  description: z.string().optional().describe('Optional description of the assignment'),
  instructions: z.string().optional().describe('Optional instructions for students'),
  maxPoints: z.number().optional().default(100).describe('Maximum points for the assignment (default: 100)'),
  assigneeMode: z.enum(['ALL_STUDENTS', 'INDIVIDUAL_STUDENTS', 'GROUP_WITH_EXCLUSIONS'])
    .optional()
    .default('ALL_STUDENTS')
    .describe('How to assign: ALL_STUDENTS (default), INDIVIDUAL_STUDENTS (requires studentIds), or GROUP_WITH_EXCLUSIONS (requires excludeStudentIds)'),
  studentIds: z.array(z.string()).optional().describe('Student IDs to assign to (required if assigneeMode is INDIVIDUAL_STUDENTS)'),
  excludeStudentIds: z.array(z.string()).optional().describe('Student IDs to exclude (required if assigneeMode is GROUP_WITH_EXCLUSIONS)'),
});

export type CreateWorksheetAssignmentArgs = z.infer<typeof createWorksheetAssignmentSchema>;

export async function createWorksheetAssignment(args: CreateWorksheetAssignmentArgs) {
  try {
    const service = ClassroomService.getInstance();

    const result = await service.createAssignmentWithWorksheet({
      courseId: args.courseId,
      title: args.title,
      pdfUrl: args.worksheetPdfUrl,
      description: args.description,
      instructions: args.instructions,
      maxPoints: args.maxPoints,
      assigneeMode: args.assigneeMode as any,
      studentIds: args.studentIds,
      excludeStudentIds: args.excludeStudentIds,
    });

    let responseText = `✅ **Assignment Created Successfully!**\n\n`;
    responseText += `**${result.message}**\n\n`;
    responseText += `**Assignment Details:**\n`;
    responseText += `• Title: ${result.assignment.title}\n`;
    responseText += `• Assignment ID: ${result.assignment.id}\n`;
    responseText += `• Max Points: ${result.assignment.maxPoints || 'Ungraded'}\n`;
    responseText += `• State: ${result.assignment.state}\n\n`;

    responseText += `**Links:**\n`;
    responseText += `• Google Classroom: ${result.assignment.alternateLink}\n`;
    responseText += `• Worksheet in Drive: ${result.driveFile.webViewLink}\n\n`;

    responseText += `The worksheet has been uploaded to Google Drive and attached to the assignment. Students can now access it through Google Classroom!`;

    // Check if this worksheet has an answer key stored
    if (result.assignment.id) {
      try {
        const worksheetStorage = (await import('../storage/worksheetStorageManager.js')).WorksheetStorageManager.getInstance();
        const worksheetData = await worksheetStorage.getWorksheetByAssignment(result.assignment.id);
        if (worksheetData && worksheetData.answerKeyPdfUrl) {
          responseText += `\n\n📝 **Answer Key Available**: The answer key for this worksheet has been stored and can be used for grading.`;
        }
      } catch (error) {
        // Ignore storage check errors
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: responseText,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to create assignment: ${error instanceof Error ? error.message : 'Unknown error'}\n\nMake sure:\n1. You have proper Google Classroom and Drive permissions\n2. The courseId is valid\n3. The worksheet PDF URL is accessible`,
        },
      ],
      isError: true,
    };
  }
}
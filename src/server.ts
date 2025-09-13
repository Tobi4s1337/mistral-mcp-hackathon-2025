import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type GetPromptResult, type ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import {
  listCourses,
  getCourseDetails,
  getAssignments,
  getComprehensiveClassroomData,
  nudgeStudents,
  createWorksheetAssignment,
} from "./classroom/tools/index.js";
import { optimizedWorksheetService } from "./worksheets/index.js";

export const getServer = (): McpServer => {
  const server = new McpServer(
    {
      name: "eduadapt-mcp-server",
      version: "0.1.0",
    },
    { capabilities: {} },
  );

  // Register Google Classroom tools
  server.tool(
    "google-classroom-courses",
    "Lists all Google Classroom courses for the authenticated user. Returns an array of courses with their IDs, names, sections, and enrollment information. Use this first to get course IDs for other operations.",
    {},
    async () => await listCourses()
  );

  server.tool(
    "google-classroom-course-details",
    "Gets detailed information about a specific Google Classroom course. Requires a courseId parameter (string). Returns course details including name, description, room, section, teachers list, and recent announcements. The courseId must be obtained from the google-classroom-courses tool first.",
    {
      courseId: z.string().describe('The ID of the course to get details for'),
    },
    async (args) => await getCourseDetails(args)
  );

  server.tool(
    "google-classroom-assignments",
    "Gets all assignments/coursework for a specific Google Classroom course. REQUIRES a courseId parameter (string) - this is mandatory and must be provided. Optional includeSubmissions parameter (boolean, defaults to true) controls whether to include student submission details. The courseId must be obtained from the google-classroom-courses tool first. Returns a list of assignments with titles, descriptions, due dates, and optionally submission status.",
    {
      courseId: z.string().describe('The ID of the course to get assignments for'),
      includeSubmissions: z
        .boolean()
        .optional()
        .default(true)
        .describe('Whether to include submission details for each assignment'),
    },
    async (args) => await getAssignments(args)
  );

  // Register comprehensive Google Classroom data tool
  server.tool(
    "google-classroom-comprehensive-data",
    "Gets ALL Google Classroom data in a single call - courses, students with names, assignments with submissions, teachers, announcements, and student notes. This is the most efficient way to get all classroom information at once. Returns a comprehensive data structure with all courses, each containing full details about students (with their notes from the storage system), teachers, assignments (with submission status), and recent announcements. No parameters required by default. Optional parameters: includeAnnouncements (boolean, default true), includeSubmissions (boolean, default true), maxAssignmentsPerCourse (number, default 20), maxAnnouncementsPerCourse (number, default 10). Use this tool instead of making multiple calls to individual tools for better performance.",
    {
      includeAnnouncements: z
        .boolean()
        .optional()
        .default(true)
        .describe('Whether to include recent announcements for each course'),
      includeSubmissions: z
        .boolean()
        .optional()
        .default(true)
        .describe('Whether to include student submissions for assignments'),
      maxAssignmentsPerCourse: z
        .number()
        .optional()
        .default(20)
        .describe('Maximum number of assignments to fetch per course'),
      maxAnnouncementsPerCourse: z
        .number()
        .optional()
        .default(10)
        .describe('Maximum number of recent announcements to fetch per course'),
    },
    async (args) => await getComprehensiveClassroomData(args)
  );

  // Register nudge students tool
  server.tool(
    "google-classroom-nudge-students",
    "Sends a reminder announcement to all students who have pending assignments in a specific Google Classroom course. REQUIRES a courseId parameter (string). The tool will automatically identify students with incomplete or unsubmitted assignments (excluding those more than 7 days past due), and send a friendly reminder listing the pending assignments. Returns information about which students were nudged and how many pending assignments they have. Perfect for encouraging students to complete their work.",
    {
      courseId: z.string().describe('The ID of the course to nudge students in'),
    },
    async (args) => await nudgeStudents(args)
  );

  // Register worksheet generation tool
  server.tool(
    "generate-worksheet",
    "Generates a comprehensive, printer-friendly educational worksheet based on a text prompt. The tool automatically creates age-appropriate content with varied question types (fill-in-the-blanks, multiple choice, short answer, essays, math problems, etc.). The worksheet is automatically converted to PDF and uploaded to S3 for easy sharing and printing. An answer key PDF is also generated. Simply provide a description of what you want the worksheet to cover, including subject, topic, grade level or age, and any specific requirements. Examples: 'Create a 4th grade math worksheet on fractions', 'Generate a high school biology worksheet about cell division', 'Make a kindergarten worksheet for learning letters A-E with tracing'. The tool uses AI to generate 15-25 questions/activities in a beautifully formatted, dense layout perfect for classroom use.",
    {
      prompt: z.string().describe('Description of the worksheet to generate. Include subject, topic, grade level/age, and any specific requirements.'),
      includeAnswerKey: z.boolean().optional().default(true).describe('Whether to generate an answer key (default: true)')
    },
    async ({ prompt, includeAnswerKey }) => {
      try {
        const result = await optimizedWorksheetService.generateWorksheetWithPDF(prompt, includeAnswerKey);

        let responseText = `✅ **Worksheet Generated Successfully!**\n\n`;
        responseText += `**Title:** ${result.title}\n`;
        responseText += `**Subject:** ${result.subject}\n`;
        responseText += `**Grade Level:** ${result.grade}\n\n`;
        responseText += `**Summary:** ${result.summary}\n\n`;

        if (result.totalPoints) {
          responseText += `**📊 Grading Information:**\n`;
          responseText += `• Total Points: ${result.totalPoints}\n`;
          if (result.gradingBreakdown && result.gradingBreakdown.length > 0) {
            responseText += `• Points by Section:\n`;
            result.gradingBreakdown.forEach(section => {
              responseText += `  - ${section.section}: ${section.points} pts\n`;
            });
          }
          responseText += `\n`;
        }

        responseText += `**📄 PDF Files:**\n`;
        responseText += `• Worksheet PDF: ${result.pdfUrl}\n`;

        if (result.answerKeyPdfUrl) {
          responseText += `• Answer Key PDF (with grading rubric): ${result.answerKeyPdfUrl}\n`;
        }

        responseText += `\nThe PDFs are ready for download, printing, or sharing with students!`;

        return {
          content: [
            {
              type: "text",
              text: responseText
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to generate worksheet: ${error instanceof Error ? error.message : "Unknown error"}\n\nMake sure:\n1. PDF export service is running: docker run -p 2305:2305 bedrockio/export-html\n2. AWS credentials and S3_BUCKET_NAME are configured in .env\n3. Mistral API key is configured`
            }
          ],
          isError: true
        };
      }
    }
  );

  // Register create worksheet assignment tool
  server.tool(
    "google-classroom-create-worksheet-assignment",
    "Creates a Google Classroom assignment with an attached worksheet PDF. This tool takes a worksheet PDF (typically generated by the generate-worksheet tool or any other PDF URL), uploads it to Google Drive, and creates an assignment in the specified course. The worksheet becomes accessible to students through Google Classroom. REQUIRES courseId and worksheetPdfUrl parameters. You can assign to all students (default), specific students only, or all students except certain excluded ones. The tool automatically handles the PDF upload to Google Drive and proper attachment to the assignment. Perfect for distributing generated worksheets or any educational PDFs to your class. Returns the assignment details with links to both the Classroom assignment and the Drive file.",
    {
      courseId: z.string().describe('The ID of the course to create the assignment in. Must be obtained from google-classroom-courses tool first'),
      worksheetPdfUrl: z.string().describe('The URL of the worksheet PDF to attach. Can be an S3 URL from generate-worksheet tool or any accessible PDF URL'),
      title: z.string().describe('The title of the assignment that students will see'),
      description: z.string().optional().describe('Optional description/context for the assignment'),
      instructions: z.string().optional().describe('Optional specific instructions for completing the worksheet'),
      maxPoints: z.number().optional().default(100).describe('Maximum points for grading (default: 100). Set to 0 for ungraded'),
      assigneeMode: z.enum(['ALL_STUDENTS', 'INDIVIDUAL_STUDENTS', 'GROUP_WITH_EXCLUSIONS'])
        .optional()
        .default('ALL_STUDENTS')
        .describe('Assignment distribution: ALL_STUDENTS assigns to everyone (default), INDIVIDUAL_STUDENTS assigns only to specified studentIds, GROUP_WITH_EXCLUSIONS assigns to all except specified excludeStudentIds'),
      studentIds: z.array(z.string()).optional().describe('List of student IDs to assign to (only used when assigneeMode is INDIVIDUAL_STUDENTS)'),
      excludeStudentIds: z.array(z.string()).optional().describe('List of student IDs to exclude (only used when assigneeMode is GROUP_WITH_EXCLUSIONS)'),
    },
    async (args) => await createWorksheetAssignment(args)
  );

  // Register a simple prompt example
  server.prompt(
    "greeting-template",
    "A simple greeting prompt template",
    {
      name: z.string().describe("Name to include in greeting"),
    },
    async ({ name }): Promise<GetPromptResult> => {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Please greet ${name} in a friendly manner.`,
            },
          },
        ],
      };
    },
  );

  server.resource(
    "greeting-resource",
    "https://example.com/greetings/default",
    { mimeType: "text/plain" },
    async (): Promise<ReadResourceResult> => {
      return {
        contents: [
          {
            uri: "https://example.com/greetings/default",
            text: "Hello, world!",
          },
        ],
      };
    },
  );

  return server;
};

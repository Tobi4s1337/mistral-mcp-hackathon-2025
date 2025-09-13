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
import { gradingService } from "./grading/index.js";
import { ClassroomService } from "./classroom/services/classroomService.js";
import { initializeBriaClient } from "./bria/service.js";
import { config } from "./config.js";

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

  // Register grade all submissions tool
  server.tool(
    "google-classroom-grade-all-submissions",
    "Grades ALL student submissions for a specific assignment using AI-powered OCR and analysis. This tool processes PDF submissions in parallel for maximum efficiency. It extracts text from student work using Mistral OCR, compares against the answer key, awards partial credit, and provides personalized feedback. REQUIRES courseId and assignmentId. The assignment must have an associated answer key (created via generate-worksheet tool). Returns comprehensive grading results including scores by section, overall feedback, and learning recommendations (scaffolding/acceleration needs) for each student. Processes all submissions concurrently for fast batch grading.",
    {
      courseId: z.string().describe('The ID of the course. Must be obtained from google-classroom-courses tool first'),
      assignmentId: z.string().describe('The ID of the assignment to grade. Must be obtained from google-classroom-assignments tool'),
    },
    async ({ courseId, assignmentId }) => {
      try {
        const classroomService = ClassroomService.getInstance();
        
        // Get assignment details
        const assignment = await classroomService.client.getCourseWork(courseId, assignmentId);
        if (!assignment) {
          throw new Error(`Assignment ${assignmentId} not found in course ${courseId}`);
        }

        // Get all submissions for this assignment
        const submissionsResponse = await classroomService.client.listStudentSubmissions(
          courseId,
          assignmentId,
          100
        );
        
        const submissions = submissionsResponse.studentSubmissions || [];
        
        if (submissions.length === 0) {
          return {
            content: [{
              type: "text",
              text: `No submissions found for assignment "${assignment.title || assignmentId}"`
            }]
          };
        }

        // Get student profiles for name mapping
        const students = await classroomService.getCourseStudents(courseId);
        const studentMap = new Map(
          students.map(s => [s.userId, s.profile?.name?.fullName || 'Unknown Student'])
        );

        // Extract submissions with PDF attachments
        const gradableSubmissions = [];
        
        for (const submission of submissions) {
          if (!submission.userId || submission.state === 'NEW' || submission.state === 'CREATED') {
            continue; // Skip unsubmitted work
          }

          const attachments = submission.assignmentSubmission?.attachments || [];
          
          for (const attachment of attachments) {
            if (attachment.driveFile?.id) {
              // We'll download and process the file later
              gradableSubmissions.push({
                assignmentId,
                userName: studentMap.get(submission.userId) || 'Unknown Student',
                userId: submission.userId,
                driveFileId: attachment.driveFile.id,
                driveFileName: attachment.driveFile.title || 'submission.pdf',
                submissionId: submission.id,
                state: submission.state
              });
              break; // Only grade first PDF per student
            }
          }
        }

        if (gradableSubmissions.length === 0) {
          return {
            content: [{
              type: "text",
              text: `No PDF submissions found to grade for assignment "${assignment.title || assignmentId}". ${submissions.length} submission(s) exist but none have PDF attachments.`
            }]
          };
        }

        // Import necessary modules for file handling
        const fs = await import('fs/promises');
        const path = await import('path');
        const os = await import('os');
        
        // Grade all submissions in parallel
        console.log(`Grading ${gradableSubmissions.length} submissions in parallel...`);
        
        const gradingPromises = gradableSubmissions.map(async (sub) => {
          try {
            // Download the PDF from Google Drive
            console.log(`Processing PDF submission from ${sub.userName} (${sub.userId})`);
            
            // Create downloads directory for inspection
            const downloadsDir = path.join(process.cwd(), 'downloaded-submissions');
            await fs.mkdir(downloadsDir, { recursive: true });
            
            const savedFilePath = path.join(downloadsDir, `${sub.submissionId}_${sub.userName.replace(/[^a-z0-9]/gi, '_')}_${sub.driveFileName}`);
            
            try {
              // Download file from Google Drive
              const drive = await classroomService.client.getDriveClient();
              console.log(`Downloading Drive file ${sub.driveFileId} for ${sub.userName}`);
              
              // Get file metadata first
              const fileMetadata = await drive.files.get({
                fileId: sub.driveFileId,
                fields: 'name,mimeType,size'
              });
              
              console.log(`File metadata for ${sub.userName}:`, {
                name: fileMetadata.data.name,
                mimeType: fileMetadata.data.mimeType,
                size: fileMetadata.data.size
              });
              
              const response = await drive.files.get(
                { fileId: sub.driveFileId, alt: 'media' },
                { responseType: 'arraybuffer' }
              );
              
              const arrayBuffer = response.data as ArrayBuffer;
              console.log(`Downloaded ${arrayBuffer.byteLength} bytes for ${sub.userName}`);
              
              // Save to file for inspection
              await fs.writeFile(savedFilePath, Buffer.from(arrayBuffer));
              console.log(`✅ PDF saved for inspection: ${savedFilePath}`);
              
              // Check if it's actually a PDF
              const fileBuffer = await fs.readFile(savedFilePath);
              const isPDF = fileBuffer.slice(0, 4).toString() === '%PDF';
              if (!isPDF) {
                console.warn(`⚠️ File does not appear to be a PDF for ${sub.userName}. First bytes: ${fileBuffer.slice(0, 20).toString('hex')}`);
              }
              
              // Upload to S3 first for reliable OCR processing
              console.log(`📤 Uploading PDF to S3 for ${sub.userName}...`);
              const { pdfExportService } = await import('./worksheets/pdf.js');
              
              let pdfUrl: string;
              try {
                const s3Url = await pdfExportService.uploadToS3(
                  fileBuffer,
                  `${sub.submissionId}_${sub.userName.replace(/[^a-z0-9]/gi, '_')}.pdf`,
                  {
                    studentName: sub.userName,
                    assignmentId: sub.assignmentId,
                    submissionId: sub.submissionId || 'unknown'
                  }
                );
                console.log(`✅ PDF uploaded to S3: ${s3Url}`);
                pdfUrl = s3Url;
              } catch (s3Error) {
                console.warn(`⚠️ S3 upload failed for ${sub.userName}, falling back to local file:`, s3Error);
                // Fallback to local file if S3 fails
                pdfUrl = `file://${savedFilePath}`;
              }
              
              // Grade the submission using S3 URL or local file
              const result = await gradingService.gradeStudentSubmission({
                assignmentId: sub.assignmentId,
                userName: sub.userName,
                userId: sub.userId,
                pdfUrl: pdfUrl
              });
              
              // Keep the file for inspection - don't delete
              console.log(`📁 Keeping downloaded PDF for inspection: ${savedFilePath}`);
              
              return result;
            } catch (downloadError: any) {
              console.error(`Failed to download/process PDF for ${sub.userName}:`, downloadError);
              
              // Try alternative download method using classroom client
              try {
                const downloadPath = await classroomService.client.downloadFile(
                  sub.driveFileId,
                  savedFilePath
                );
                
                console.log(`✅ PDF saved via alternative method: ${downloadPath}`);
                
                // Use file path for OCR
                const filePdfUrl = `file://${downloadPath}`;
                
                const result = await gradingService.gradeStudentSubmission({
                  assignmentId: sub.assignmentId,
                  userName: sub.userName,
                  userId: sub.userId,
                  pdfUrl: filePdfUrl
                });
                
                // Keep the file for inspection
                console.log(`📁 Keeping downloaded PDF for inspection: ${downloadPath}`);
                
                return result;
              } catch (altError) {
                throw new Error(`Could not download PDF: ${downloadError.message}`);
              }
            }
          } catch (error: any) {
            return {
              userName: sub.userName,
              userId: sub.userId,
              assignmentId: sub.assignmentId,
              submittedPdfUrl: `Drive file: ${sub.driveFileId}`,
              gradedAt: new Date().toISOString(),
              overallScore: 0,
              totalPossiblePoints: 0,
              percentageScore: 0,
              sectionScores: [],
              overallFeedback: `Grading failed: ${error.message}`,
              learningRecommendations: {
                needsScaffolding: false,
                scaffoldingAreas: [],
                readyForAcceleration: false,
                accelerationAreas: [],
                generalRecommendation: "Unable to grade submission"
              },
              error: true
            };
          }
        });

        const results = await Promise.all(gradingPromises);

        // Separate successful and failed gradings
        const successful = results.filter(r => !(r as any).error);
        const failed = results.filter(r => (r as any).error);

        // Calculate statistics
        const avgScore = successful.length > 0 
          ? successful.reduce((sum, r) => sum + r.percentageScore, 0) / successful.length 
          : 0;
        
        const needsSupport = successful.filter(r => r.learningRecommendations.needsScaffolding);
        const readyForMore = successful.filter(r => r.learningRecommendations.readyForAcceleration);

        // Build response
        let responseText = `📊 **Grading Complete for "${assignment.title || 'Assignment'}"**\n\n`;
        responseText += `**Summary:**\n`;
        responseText += `• Total submissions graded: ${successful.length}/${gradableSubmissions.length}\n`;
        responseText += `• Average score: ${avgScore.toFixed(1)}%\n`;
        responseText += `• Students needing support: ${needsSupport.length}\n`;
        responseText += `• Students ready for acceleration: ${readyForMore.length}\n`;
        
        if (failed.length > 0) {
          responseText += `• Failed to grade: ${failed.length} submission(s)\n`;
        }
        
        responseText += `\n**Individual Results:**\n\n`;
        
        // Sort by score (highest first)
        const sortedResults = [...successful].sort((a, b) => b.percentageScore - a.percentageScore);
        
        for (const result of sortedResults) {
          responseText += `**${result.userName}** (${result.userId})\n`;
          responseText += `• Score: ${result.overallScore}/${result.totalPossiblePoints} (${result.percentageScore}%)\n`;
          
          if (result.sectionScores.length > 0) {
            responseText += `• Sections: `;
            responseText += result.sectionScores.map(s => 
              `${s.sectionName}: ${s.pointsEarned}/${s.pointsPossible}`
            ).join(', ');
            responseText += `\n`;
          }
          
          responseText += `• Feedback: ${result.overallFeedback}\n`;
          
          if (result.learningRecommendations.needsScaffolding) {
            responseText += `• 🔶 Needs support in: ${result.learningRecommendations.scaffoldingAreas.join(', ')}\n`;
          }
          
          if (result.learningRecommendations.readyForAcceleration) {
            responseText += `• 🚀 Ready for acceleration in: ${result.learningRecommendations.accelerationAreas.join(', ')}\n`;
          }
          
          responseText += `• Recommendation: ${result.learningRecommendations.generalRecommendation}\n`;
          responseText += `\n`;
        }
        
        // Add failed gradings at the end
        if (failed.length > 0) {
          responseText += `**Failed Gradings:**\n`;
          for (const result of failed) {
            responseText += `• ${result.userName}: ${result.overallFeedback}\n`;
          }
        }

        return {
          content: [{
            type: "text",
            text: responseText
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Failed to grade submissions: ${error instanceof Error ? error.message : "Unknown error"}\n\nMake sure:\n1. The assignment exists and has submissions\n2. The assignment was created with generate-worksheet (has answer key)\n3. Students have submitted PDF files`
          }],
          isError: true
        };
      }
    }
  );

  // Register Bria AI image generation tool
  server.tool(
    "generate-image",
    "Generates high-quality images using Bria AI based on text prompts. Perfect for creating motivational images for students, educational illustrations, or visual aids for worksheets. The tool supports various aspect ratios and styles (photography or art). Returns the URL of the generated image that can be shared with students or embedded in materials. Use this for creating engaging visual content to enhance learning experiences.",
    {
      prompt: z.string().describe('The text prompt describing the image to generate. Be specific about what you want to see.'),
      aspectRatio: z.enum(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9'])
        .optional()
        .default('16:9')
        .describe('The aspect ratio of the generated image. Default: 16:9 (good for presentations)'),
      style: z.enum(['photography', 'art'])
        .optional()
        .default('art')
        .describe('The visual style: photography for realistic images, art for illustrations. Default: art'),
      isMotivational: z.boolean()
        .optional()
        .default(false)
        .describe('Whether to optimize the prompt for motivational/educational content. Adds uplifting and encouraging elements.')
    },
    async ({ prompt, aspectRatio, style, isMotivational }) => {
      try {
        // Initialize Bria client if needed
        if (!config.BRIA_API_KEY) {
          throw new Error('Bria API key not configured. Please set BRIA_API_KEY environment variable.');
        }
        
        const briaClient = initializeBriaClient({ apiKey: config.BRIA_API_KEY });
        
        let imageUrl: string;
        
        if (isMotivational) {
          // Use the specialized motivational image generation
          imageUrl = await briaClient.generateMotivationalImage(prompt, style);
        } else {
          // Use standard image generation
          imageUrl = await briaClient.generateSingleImage(prompt, aspectRatio);
        }
        
        return {
          content: [{
            type: "text",
            text: `✅ **Image Generated Successfully!**\n\n**Image URL:** ${imageUrl}\n\n**Prompt:** ${prompt}\n**Style:** ${style}\n**Aspect Ratio:** ${aspectRatio}\n\nYou can share this URL with students or use it in educational materials. The image is hosted on Bria's servers and will remain accessible.`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Failed to generate image: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease check that:\n1. The BRIA_API_KEY is configured correctly\n2. Your prompt follows Bria's content guidelines\n3. The API service is accessible`
          }],
          isError: true
        };
      }
    }
  );

  // Register set grade and send feedback tool
  server.tool(
    "google-classroom-set-grade-feedback",
    "Sets a grade for a specific student submission and sends personalized feedback. This tool updates the student's grade in Google Classroom and delivers feedback either as a comment or announcement. REQUIRES courseId, assignmentId, and studentId parameters. Use this tool after grading student work (e.g., after using google-classroom-grade-all-submissions) to set final grades and provide individual feedback. The grade must be within the assignment's maximum points range. Feedback is optional but highly recommended for student growth. By default, sets the final grade; use isDraft=true for draft grades that students won't see immediately. Returns confirmation of grade setting and feedback delivery status. Perfect for completing the grading workflow with personalized communication to students.",
    {
      courseId: z.string().describe('The ID of the course. Must be obtained from google-classroom-courses tool first'),
      assignmentId: z.string().describe('The ID of the assignment. Must be obtained from google-classroom-assignments tool'),
      studentId: z.string().describe('The ID of the student (user ID). Can be obtained from comprehensive data or student lists'),
      grade: z.number().describe('The numeric grade to assign. Must be between 0 and the assignment\'s maximum points'),
      feedback: z.string().optional().describe('Personalized feedback message for the student. Will be sent as an announcement if direct comments are not available'),
      isDraft: z.boolean().optional().default(false).describe('Whether to set as draft grade (not visible to student) or final grade (visible immediately). Default: false (final grade)')
    },
    async ({ courseId, assignmentId, studentId, grade, feedback, isDraft }) => {
      try {
        const classroomService = ClassroomService.getInstance();
        
        const result = await classroomService.setGradeAndFeedback(
          courseId,
          assignmentId,
          studentId,
          grade,
          feedback,
          isDraft
        );

        if (!result.success) {
          return {
            content: [{
              type: "text",
              text: result.message
            }],
            isError: true
          };
        }

        let responseText = `✅ **Grade Set Successfully**\n\n`;
        responseText += `**Student:** ${result.studentName}\n`;
        responseText += `**Grade:** ${result.grade} points\n`;
        responseText += `**Grade Type:** ${isDraft ? 'Draft (not visible to student)' : 'Final (visible to student)'}\n`;
        
        if (feedback) {
          responseText += `**Feedback Status:** ${result.feedbackSent ? '✅ Sent successfully' : '⚠️ Could not send directly (check announcements)'}\n`;
          if (result.feedbackSent) {
            responseText += `\n📝 **Feedback Message:**\n${feedback}\n`;
          }
        }
        
        responseText += `\n${result.message}`;

        return {
          content: [{
            type: "text",
            text: responseText
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Failed to set grade and feedback: ${error instanceof Error ? error.message : "Unknown error"}\n\nMake sure:\n1. The course, assignment, and student IDs are valid\n2. The student has a submission for this assignment\n3. The grade is within the valid range (0 to max points)\n4. You have permission to grade this assignment`
          }],
          isError: true
        };
      }
    }
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

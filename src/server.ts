import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type GetPromptResult, type ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import {
  listCourses,
  getCourseDetails,
  getAssignments,
  getComprehensiveClassroomData,
  nudgeStudents,
} from "./classroom/tools/index.js";

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

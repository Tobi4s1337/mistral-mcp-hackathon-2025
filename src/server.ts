import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type CallToolResult, type GetPromptResult, type ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import {
  listCourses,
  getCourseDetails,
  getAssignments,
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
    async (args: any) => await getCourseDetails(args)
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
    async (args: any) => await getAssignments(args)
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

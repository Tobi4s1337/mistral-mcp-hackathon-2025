import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type CallToolResult, type GetPromptResult, type ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import {
  coursesTool,
  courseDetailsTool,
  assignmentsTool,
  listCourses,
  getCourseDetails,
  getAssignments,
  coursesSchema,
  courseDetailsSchema,
  assignmentsSchema,
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
    coursesTool.name,
    coursesTool.description,
    coursesSchema,
    async () => await listCourses()
  );

  server.tool(
    courseDetailsTool.name,
    courseDetailsTool.description,
    courseDetailsSchema,
    async (args) => await getCourseDetails(args)
  );

  server.tool(
    assignmentsTool.name,
    assignmentsTool.description,
    assignmentsSchema,
    async (args) => await getAssignments(args)
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

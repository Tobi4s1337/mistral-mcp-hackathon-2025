import { z } from 'zod';
import { ClassroomService } from '../services/classroomService.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const nudgeStudentsSchema = z.object({
  courseId: z.string().describe('The ID of the course to nudge students in'),
});

export async function nudgeStudents({ courseId }: z.infer<typeof nudgeStudentsSchema>): Promise<CallToolResult> {
  try {
    const service = ClassroomService.getInstance();
    const result = await service.nudgeStudentsWithPendingWork(courseId);

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    if (errorMessage.includes('Authentication required')) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Authentication required. Please run "npm run auth" to authenticate with Google Classroom.',
          },
        ],
      };
    }

    if (errorMessage.includes('404')) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Course with ID ${courseId} not found. Please check the course ID and try again.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: `Error nudging students: ${errorMessage}`,
        },
      ],
    };
  }
}
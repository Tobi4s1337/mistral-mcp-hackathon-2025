import { z } from 'zod';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ClassroomService } from '../services/classroomService.js';

export const coursesSchema = z.object({});

export async function listCourses() {
  try {
    const service = ClassroomService.getInstance();
    const courses = await service.getAllCourses();

    const formattedCourses = courses.map((course) => ({
      id: course.id,
      name: course.name,
      section: course.section,
      descriptionHeading: course.descriptionHeading,
      room: course.room,
      enrollmentCode: course.enrollmentCode,
      courseState: course.courseState,
      creationTime: course.creationTime,
      updateTime: course.updateTime,
      guardiansEnabled: course.guardiansEnabled,
      alternateLink: course.alternateLink,
    }));

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              totalCourses: formattedCourses.length,
              courses: formattedCourses,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error: any) {
    if (error.message?.includes('Authentication required')) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Authentication required. Please run "npm run auth" to authenticate with Google Classroom.',
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: `Error fetching courses: ${error.message || 'Unknown error occurred'}`,
        },
      ],
    };
  }
}

export const coursesTool: Tool = {
  name: 'google-classroom-courses',
  description: 'List all Google Classroom courses for the authenticated user',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};
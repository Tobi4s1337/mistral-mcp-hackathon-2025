import { z } from 'zod';
import { ClassroomService } from '../services/classroomService.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const courseDetailsSchema = z.object({
  courseId: z.string().describe('The ID of the course to get details for'),
});

export async function getCourseDetails({ courseId }: z.infer<typeof courseDetailsSchema>): Promise<CallToolResult> {
  try {
    const service = ClassroomService.getInstance();
    const courseDetails = await service.getCourseWithDetails(courseId);

    const formattedDetails = {
      course: {
        id: courseDetails.course.id,
        name: courseDetails.course.name,
        section: courseDetails.course.section,
        descriptionHeading: courseDetails.course.descriptionHeading,
        description: courseDetails.course.description,
        room: courseDetails.course.room,
        ownerId: courseDetails.course.ownerId,
        creationTime: courseDetails.course.creationTime,
        updateTime: courseDetails.course.updateTime,
        enrollmentCode: courseDetails.course.enrollmentCode,
        courseState: courseDetails.course.courseState,
        alternateLink: courseDetails.course.alternateLink,
        teacherGroupEmail: courseDetails.course.teacherGroupEmail,
        courseGroupEmail: courseDetails.course.courseGroupEmail,
        guardiansEnabled: courseDetails.course.guardiansEnabled,
        calendarId: courseDetails.course.calendarId,
      },
      teachers: courseDetails.teachers?.map((teacher) => ({
        userId: teacher.userId,
        profile: teacher.profile,
      })),
      studentCount: courseDetails.studentCount,
      announcements: courseDetails.announcements?.map((announcement) => ({
        id: announcement.id,
        courseId: announcement.courseId,
        text: announcement.text,
        materials: announcement.materials,
        state: announcement.state,
        alternateLink: announcement.alternateLink,
        creationTime: announcement.creationTime,
        updateTime: announcement.updateTime,
        creatorUserId: announcement.creatorUserId,
      })),
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(formattedDetails, null, 2),
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

    if (error.response?.status === 404) {
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
          text: `Error fetching course details: ${error.message || 'Unknown error occurred'}`,
        },
      ],
    };
  }
}


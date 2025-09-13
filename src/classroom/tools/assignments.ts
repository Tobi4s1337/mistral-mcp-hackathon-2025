import { z } from 'zod';
import { ClassroomService } from '../services/classroomService.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const assignmentsSchema = z.object({
  courseId: z.string().describe('The ID of the course to get assignments for'),
  includeSubmissions: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether to include submission details for each assignment'),
});

export async function getAssignments({
  courseId,
  includeSubmissions = true,
}: z.infer<typeof assignmentsSchema>): Promise<CallToolResult> {
  try {
    const service = ClassroomService.getInstance();

    if (includeSubmissions) {
      const assignmentsWithSubmissions = await service.getAssignmentsWithSubmissions(courseId, 10);
      
      // Filter out deleted assignments
      const activeAssignments = assignmentsWithSubmissions.filter(
        item => item.assignment.state !== 'DELETED'
      );

      const formattedAssignments = activeAssignments.map((item) => ({
        assignment: {
          id: item.assignment.id,
          courseId: item.assignment.courseId,
          title: item.assignment.title,
          description: item.assignment.description,
          materials: item.assignment.materials,
          state: item.assignment.state,
          alternateLink: item.assignment.alternateLink,
          creationTime: item.assignment.creationTime,
          updateTime: item.assignment.updateTime,
          dueDate: item.assignment.dueDate,
          dueTime: item.assignment.dueTime,
          maxPoints: item.assignment.maxPoints,
          workType: item.assignment.workType,
          submissionModificationMode: item.assignment.submissionModificationMode,
        },
        submissions: item.submissions?.map((submission) => ({
          id: submission.id,
          userId: submission.userId,
          courseId: submission.courseId,
          courseWorkId: submission.courseWorkId,
          creationTime: submission.creationTime,
          updateTime: submission.updateTime,
          state: submission.state,
          late: submission.late,
          draftGrade: submission.draftGrade,
          assignedGrade: submission.assignedGrade,
          alternateLink: submission.alternateLink,
          courseWorkType: submission.courseWorkType,
          submissionHistory: submission.submissionHistory?.length || 0,
        })),
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                courseId,
                totalAssignments: formattedAssignments.length,
                assignments: formattedAssignments,
              },
              null,
              2
            ),
          },
        ],
      };
    } else {
      const assignments = await service.getAllAssignments(courseId);
      
      // Filter out deleted assignments
      const activeAssignments = assignments.filter(
        assignment => assignment.state !== 'DELETED'
      );

      const formattedAssignments = activeAssignments.map((assignment) => ({
        id: assignment.id,
        courseId: assignment.courseId,
        title: assignment.title,
        description: assignment.description,
        state: assignment.state,
        alternateLink: assignment.alternateLink,
        creationTime: assignment.creationTime,
        updateTime: assignment.updateTime,
        dueDate: assignment.dueDate,
        dueTime: assignment.dueTime,
        maxPoints: assignment.maxPoints,
        workType: assignment.workType,
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                courseId,
                totalAssignments: formattedAssignments.length,
                assignments: formattedAssignments,
              },
              null,
              2
            ),
          },
        ],
      };
    }
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
          text: `Error fetching assignments: ${error.message || 'Unknown error occurred'}`,
        },
      ],
    };
  }
}


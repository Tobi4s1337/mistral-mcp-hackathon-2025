import { z } from 'zod';
import { ClassroomService } from '../services/classroomService.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { StudentNotesManager } from '../storage/studentNotesManager.js';

export const comprehensiveClassroomDataSchema = z.object({
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
});

interface StudentInfo {
  userId: string;
  name: string;
  email?: string;
  photoUrl?: string;
  note?: string;
  noteUpdatedAt?: string;
}

interface AssignmentInfo {
  id: string;
  title: string;
  description?: string;
  dueDate?: {
    year?: number;
    month?: number;
    day?: number;
  };
  dueTime?: {
    hours?: number;
    minutes?: number;
  };
  maxPoints?: number;
  state?: string;
  workType?: string;
  creationTime?: string;
  updateTime?: string;
  alternateLink?: string;
  submissions?: Array<{
    studentId: string;
    studentName?: string;
    submissionId: string;
    state: string;
    late?: boolean;
    assignedGrade?: number;
    draftGrade?: number;
    alternateLink?: string;
    lastUpdate?: string;
  }>;
}

interface TeacherInfo {
  userId: string;
  name: string;
  email?: string;
  photoUrl?: string;
}

interface AnnouncementInfo {
  id: string;
  text: string;
  state?: string;
  creationTime?: string;
  updateTime?: string;
  creatorUserId?: string;
}

interface ComprehensiveCourseData {
  courseId: string;
  courseName: string;
  section?: string;
  room?: string;
  courseState?: string;
  enrollmentCode?: string;
  alternateLink?: string;
  teachers: TeacherInfo[];
  students: StudentInfo[];
  assignments: AssignmentInfo[];
  announcements?: AnnouncementInfo[];
  statistics: {
    totalStudents: number;
    totalAssignments: number;
    totalSubmissions: number;
    totalAnnouncements: number;
  };
}

export async function getComprehensiveClassroomData({
  includeAnnouncements = true,
  includeSubmissions = true,
  maxAssignmentsPerCourse = 20,
  maxAnnouncementsPerCourse = 10,
}: z.infer<typeof comprehensiveClassroomDataSchema>): Promise<CallToolResult> {
  try {
    const service = ClassroomService.getInstance();
    const notesManager = StudentNotesManager.getInstance();

    // Get all courses first
    const courses = await service.getAllCourses();

    // Process each course in parallel to get comprehensive data
    const comprehensiveData = await Promise.all(
      courses.map(async (course): Promise<ComprehensiveCourseData | null> => {
        if (!course.id) return null;

        try {
          // Fetch all data for this course in parallel
          const [
            studentsResponse,
            teachersResponse,
            assignmentsResponse,
            announcementsResponse
          ] = await Promise.allSettled([
            service.getCourseStudents(course.id),
            service.client.listTeachers(course.id),
            service.getAllAssignments(course.id),
            includeAnnouncements
              ? service.client.listAnnouncements(course.id, maxAnnouncementsPerCourse)
              : Promise.resolve({ announcements: [] })
          ]);

          // Process students with notes
          const students: StudentInfo[] = [];
          if (studentsResponse.status === 'fulfilled') {
            for (const student of studentsResponse.value) {
              if (!student.userId || !student.profile?.name?.fullName) continue;

              const note = await notesManager.getNote(course.id, student.userId);

              // If no note exists, create an empty one
              if (!note) {
                await notesManager.addNote(
                  course.id,
                  student.userId,
                  student.profile.name.fullName,
                  '',
                  course.name || undefined
                );
              }

              students.push({
                userId: student.userId,
                name: student.profile.name.fullName,
                email: student.profile.emailAddress || undefined,
                photoUrl: student.profile.photoUrl || undefined,
                note: note?.note || '',
                noteUpdatedAt: note?.updatedAt
              });
            }
          }

          // Process teachers
          const teachers: TeacherInfo[] = [];
          if (teachersResponse.status === 'fulfilled' && teachersResponse.value.teachers) {
            for (const teacher of teachersResponse.value.teachers) {
              if (!teacher.userId || !teacher.profile?.name?.fullName) continue;

              teachers.push({
                userId: teacher.userId,
                name: teacher.profile.name.fullName,
                email: teacher.profile.emailAddress || undefined,
                photoUrl: teacher.profile.photoUrl || undefined
              });
            }
          }

          // Process assignments with submissions
          const assignments: AssignmentInfo[] = [];
          if (assignmentsResponse.status === 'fulfilled') {
            const limitedAssignments = assignmentsResponse.value.slice(0, maxAssignmentsPerCourse);

            for (const assignment of limitedAssignments) {
              if (!assignment.id) continue;

              const assignmentInfo: AssignmentInfo = {
                id: assignment.id,
                title: assignment.title || '',
                description: assignment.description || undefined,
                dueDate: assignment.dueDate,
                dueTime: assignment.dueTime,
                maxPoints: assignment.maxPoints || undefined,
                state: assignment.state || undefined,
                workType: assignment.workType || undefined,
                creationTime: assignment.creationTime || undefined,
                updateTime: assignment.updateTime || undefined,
                alternateLink: assignment.alternateLink || undefined,
              };

              // Fetch submissions if requested
              if (includeSubmissions) {
                try {
                  const submissionsResponse = await service.client.listStudentSubmissions(
                    course.id,
                    assignment.id
                  );

                  if (submissionsResponse.studentSubmissions) {
                    assignmentInfo.submissions = submissionsResponse.studentSubmissions.map(submission => {
                      // Find student name from our students array
                      const student = students.find(s => s.userId === submission.userId);

                      return {
                        studentId: submission.userId || '',
                        studentName: student?.name,
                        submissionId: submission.id || '',
                        state: submission.state || '',
                        late: submission.late || false,
                        assignedGrade: submission.assignedGrade || undefined,
                        draftGrade: submission.draftGrade || undefined,
                        alternateLink: submission.alternateLink || undefined,
                        lastUpdate: submission.updateTime || undefined
                      };
                    });
                  }
                } catch (error) {
                  console.error(`Error fetching submissions for assignment ${assignment.id}:`, error);
                }
              }

              assignments.push(assignmentInfo);
            }
          }

          // Process announcements
          const announcements: AnnouncementInfo[] = [];
          if (announcementsResponse.status === 'fulfilled' && announcementsResponse.value.announcements) {
            for (const announcement of announcementsResponse.value.announcements) {
              if (!announcement.id) continue;

              announcements.push({
                id: announcement.id,
                text: announcement.text || '',
                state: announcement.state || undefined,
                creationTime: announcement.creationTime || undefined,
                updateTime: announcement.updateTime || undefined,
                creatorUserId: announcement.creatorUserId || undefined
              });
            }
          }

          // Calculate statistics
          const totalSubmissions = assignments.reduce(
            (sum, assignment) => sum + (assignment.submissions?.length || 0),
            0
          );

          return {
            courseId: course.id,
            courseName: course.name || '',
            section: course.section || undefined,
            room: course.room || undefined,
            courseState: course.courseState || undefined,
            enrollmentCode: course.enrollmentCode || undefined,
            alternateLink: course.alternateLink || undefined,
            teachers,
            students,
            assignments,
            announcements: includeAnnouncements ? announcements : undefined,
            statistics: {
              totalStudents: students.length,
              totalAssignments: assignments.length,
              totalSubmissions,
              totalAnnouncements: announcements.length
            }
          };
        } catch (error) {
          console.error(`Error processing course ${course.id}:`, error);
          return null;
        }
      })
    );

    // Filter out null results
    const validCourses = comprehensiveData.filter((course): course is ComprehensiveCourseData => course !== null);

    // Calculate overall statistics
    const overallStats = {
      totalCourses: validCourses.length,
      totalStudents: validCourses.reduce((sum, c) => sum + c.statistics.totalStudents, 0),
      totalAssignments: validCourses.reduce((sum, c) => sum + c.statistics.totalAssignments, 0),
      totalSubmissions: validCourses.reduce((sum, c) => sum + c.statistics.totalSubmissions, 0),
      totalAnnouncements: validCourses.reduce((sum, c) => sum + c.statistics.totalAnnouncements, 0),
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              summary: overallStats,
              courses: validCourses,
              timestamp: new Date().toISOString()
            },
            null,
            2
          ),
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

    return {
      content: [
        {
          type: 'text' as const,
          text: `Error fetching comprehensive classroom data: ${errorMessage}`,
        },
      ],
    };
  }
}
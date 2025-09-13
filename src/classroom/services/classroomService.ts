import { ClassroomClient } from '../api/classroomClient.js';
import { classroom_v1 } from 'googleapis';

export interface CourseWithDetails {
  course: classroom_v1.Schema$Course;
  announcements?: classroom_v1.Schema$Announcement[];
  teachers?: classroom_v1.Schema$Teacher[];
  studentCount?: number;
}

export interface AssignmentWithSubmissions {
  assignment: classroom_v1.Schema$CourseWork;
  submissions?: classroom_v1.Schema$StudentSubmission[];
}

export class ClassroomService {
  private static instance: ClassroomService;
  private client: ClassroomClient;

  private constructor() {
    this.client = ClassroomClient.getInstance();
  }

  static getInstance(): ClassroomService {
    if (!ClassroomService.instance) {
      ClassroomService.instance = new ClassroomService();
    }
    return ClassroomService.instance;
  }

  async getAllCourses(): Promise<classroom_v1.Schema$Course[]> {
    const courses: classroom_v1.Schema$Course[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.client.listCourses(50, pageToken);
      if (response.courses) {
        courses.push(...response.courses);
      }
      pageToken = response.nextPageToken || undefined;
    } while (pageToken);

    return courses;
  }

  async getCourseWithDetails(courseId: string): Promise<CourseWithDetails> {
    const [course, announcementsResponse, teachersResponse, studentsResponse] = await Promise.allSettled([
      this.client.getCourse(courseId),
      this.client.listAnnouncements(courseId, 10),
      this.client.listTeachers(courseId),
      this.client.listStudents(courseId),
    ]);

    const result: CourseWithDetails = {
      course: course.status === 'fulfilled' ? course.value : {},
    };

    if (announcementsResponse.status === 'fulfilled') {
      result.announcements = announcementsResponse.value.announcements || [];
    }

    if (teachersResponse.status === 'fulfilled') {
      result.teachers = teachersResponse.value.teachers || [];
    }

    if (studentsResponse.status === 'fulfilled') {
      result.studentCount = studentsResponse.value.students?.length || 0;
    }

    return result;
  }

  async getAllAssignments(courseId: string): Promise<classroom_v1.Schema$CourseWork[]> {
    const assignments: classroom_v1.Schema$CourseWork[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.client.listCourseWork(courseId, 50, pageToken);
      if (response.courseWork) {
        assignments.push(...response.courseWork);
      }
      pageToken = response.nextPageToken || undefined;
    } while (pageToken);

    return assignments;
  }

  async getAssignmentsWithSubmissions(
    courseId: string,
    limit = 10
  ): Promise<AssignmentWithSubmissions[]> {
    const assignments = await this.getAllAssignments(courseId);
    const limitedAssignments = assignments.slice(0, limit);

    const assignmentsWithSubmissions = await Promise.all(
      limitedAssignments.map(async (assignment) => {
        const result: AssignmentWithSubmissions = { assignment };

        if (assignment.id) {
          try {
            const submissionsResponse = await this.client.listStudentSubmissions(
              courseId,
              assignment.id
            );
            result.submissions = submissionsResponse.studentSubmissions || [];
          } catch (error) {
            console.error(`Error fetching submissions for assignment ${assignment.id}:`, error);
          }
        }

        return result;
      })
    );

    return assignmentsWithSubmissions;
  }

  async createAssignment(
    courseId: string,
    title: string,
    description: string,
    dueDate?: Date,
    materials?: classroom_v1.Schema$Material[]
  ): Promise<classroom_v1.Schema$CourseWork> {
    const courseWork: classroom_v1.Schema$CourseWork = {
      title,
      description,
      materials,
      workType: 'ASSIGNMENT',
      state: 'PUBLISHED',
    };

    if (dueDate) {
      const due = new Date(dueDate);
      courseWork.dueDate = {
        year: due.getFullYear(),
        month: due.getMonth() + 1,
        day: due.getDate(),
      };
      courseWork.dueTime = {
        hours: due.getHours(),
        minutes: due.getMinutes(),
      };
    }

    return await this.client.createCourseWork(courseId, courseWork);
  }

  async createAnnouncement(
    courseId: string,
    text: string,
    materials?: classroom_v1.Schema$Material[]
  ): Promise<classroom_v1.Schema$Announcement> {
    return await this.client.createAnnouncement(courseId, text, materials);
  }

  async getStudentSubmissions(
    courseId: string,
    assignmentId: string
  ): Promise<classroom_v1.Schema$StudentSubmission[]> {
    const response = await this.client.listStudentSubmissions(courseId, assignmentId);
    return response.studentSubmissions || [];
  }

  async getCourseStudents(courseId: string): Promise<classroom_v1.Schema$Student[]> {
    const response = await this.client.listStudents(courseId);
    return response.students || [];
  }
}
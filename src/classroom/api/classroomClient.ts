import { google, classroom_v1 } from 'googleapis';
import { AuthManager } from '../auth/authManager.js';

export class ClassroomClient {
  private static instance: ClassroomClient;
  private classroom: classroom_v1.Classroom | null = null;
  private authManager: AuthManager;

  private constructor() {
    this.authManager = AuthManager.getInstance();
  }

  static getInstance(): ClassroomClient {
    if (!ClassroomClient.instance) {
      ClassroomClient.instance = new ClassroomClient();
    }
    return ClassroomClient.instance;
  }

  async getClient(): Promise<classroom_v1.Classroom> {
    if (this.classroom) {
      return this.classroom;
    }

    const auth = await this.authManager.getAuthClient();
    this.classroom = google.classroom({
      version: 'v1',
      auth,
    });

    return this.classroom;
  }

  async listCourses(pageSize = 50, pageToken?: string): Promise<classroom_v1.Schema$ListCoursesResponse> {
    const classroom = await this.getClient();
    const response = await classroom.courses.list({
      pageSize,
      pageToken,
      courseStates: ['ACTIVE'],
    });
    return response.data;
  }

  async getCourse(courseId: string): Promise<classroom_v1.Schema$Course> {
    const classroom = await this.getClient();
    const response = await classroom.courses.get({ id: courseId });
    return response.data;
  }

  async listAnnouncements(
    courseId: string,
    pageSize = 20,
    pageToken?: string
  ): Promise<classroom_v1.Schema$ListAnnouncementsResponse> {
    const classroom = await this.getClient();
    const response = await classroom.courses.announcements.list({
      courseId,
      pageSize,
      pageToken,
      orderBy: 'updateTime desc',
    });
    return response.data;
  }

  async createAnnouncement(
    courseId: string,
    text: string,
    materials?: classroom_v1.Schema$Material[]
  ): Promise<classroom_v1.Schema$Announcement> {
    const classroom = await this.getClient();
    const response = await classroom.courses.announcements.create({
      courseId,
      requestBody: {
        text,
        materials,
        state: 'PUBLISHED',
      },
    });
    return response.data;
  }

  async listCourseWork(
    courseId: string,
    pageSize = 50,
    pageToken?: string
  ): Promise<classroom_v1.Schema$ListCourseWorkResponse> {
    const classroom = await this.getClient();
    const response = await classroom.courses.courseWork.list({
      courseId,
      pageSize,
      pageToken,
      orderBy: 'dueDate desc',
    });
    return response.data;
  }

  async getCourseWork(courseId: string, courseWorkId: string): Promise<classroom_v1.Schema$CourseWork> {
    const classroom = await this.getClient();
    const response = await classroom.courses.courseWork.get({
      courseId,
      id: courseWorkId,
    });
    return response.data;
  }

  async createCourseWork(
    courseId: string,
    courseWork: classroom_v1.Schema$CourseWork
  ): Promise<classroom_v1.Schema$CourseWork> {
    const classroom = await this.getClient();
    const response = await classroom.courses.courseWork.create({
      courseId,
      requestBody: {
        ...courseWork,
        state: courseWork.state || 'PUBLISHED',
      },
    });
    return response.data;
  }

  async listStudentSubmissions(
    courseId: string,
    courseWorkId: string,
    userId?: string
  ): Promise<classroom_v1.Schema$ListStudentSubmissionsResponse> {
    const classroom = await this.getClient();
    const response = await classroom.courses.courseWork.studentSubmissions.list({
      courseId,
      courseWorkId,
      userId,
      states: ['TURNED_IN', 'RETURNED', 'RECLAIMED_BY_STUDENT', 'NEW', 'CREATED'],
    });
    return response.data;
  }

  async getStudentSubmission(
    courseId: string,
    courseWorkId: string,
    submissionId: string
  ): Promise<classroom_v1.Schema$StudentSubmission> {
    const classroom = await this.getClient();
    const response = await classroom.courses.courseWork.studentSubmissions.get({
      courseId,
      courseWorkId,
      id: submissionId,
    });
    return response.data;
  }

  async listStudents(courseId: string, pageSize = 50): Promise<classroom_v1.Schema$ListStudentsResponse> {
    const classroom = await this.getClient();
    const response = await classroom.courses.students.list({
      courseId,
      pageSize,
    });
    return response.data;
  }

  async listTeachers(courseId: string, pageSize = 50): Promise<classroom_v1.Schema$ListTeachersResponse> {
    const classroom = await this.getClient();
    const response = await classroom.courses.teachers.list({
      courseId,
      pageSize,
    });
    return response.data;
  }
}
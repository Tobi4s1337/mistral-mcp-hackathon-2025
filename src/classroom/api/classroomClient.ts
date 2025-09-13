import { google, classroom_v1, drive_v3 } from 'googleapis';
import { AuthManager } from '../auth/authManager.js';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

export class ClassroomClient {
  private static instance: ClassroomClient;
  private classroom: classroom_v1.Classroom | null = null;
  private drive: drive_v3.Drive | null = null;
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

  async getDriveClient(): Promise<drive_v3.Drive> {
    if (this.drive) {
      return this.drive;
    }

    const auth = await this.authManager.getAuthClient();
    this.drive = google.drive({
      version: 'v3',
      auth,
    });

    return this.drive;
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
    console.log(`[DEBUG] Fetching courseWork for course ${courseId}`);
    const response = await classroom.courses.courseWork.list({
      courseId,
      pageSize,
      pageToken,
      courseWorkStates: ['PUBLISHED', 'DRAFT', 'DELETED'],
    });
    console.log(`[DEBUG] CourseWork API response:`, JSON.stringify(response.data, null, 2));
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

  async downloadFile(fileId: string, outputPath: string): Promise<string> {
    try {
      const drive = await this.getDriveClient();

      // Get file metadata
      const fileMetadata = await drive.files.get({
        fileId,
        fields: 'name,mimeType,size',
      });

      const fileName = fileMetadata.data.name || 'unknown';
      const mimeType = fileMetadata.data.mimeType || '';

      // Ensure output directory exists
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      // Download the file
      const response = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' }
      );

      // Save to file
      const dest = await fs.open(outputPath, 'w');
      const writeStream = dest.createWriteStream();

      return new Promise((resolve, reject) => {
        response.data
          .on('end', async () => {
            await dest.close();
            resolve(outputPath);
          })
          .on('error', async (error: any) => {
            await dest.close();
            reject(error);
          })
          .pipe(writeStream);
      });
    } catch (error) {
      console.error(`Error downloading file ${fileId}:`, error);
      throw error;
    }
  }

  async downloadFileFromUrl(url: string, outputPath: string): Promise<string> {
    try {
      const auth = await this.authManager.getAuthClient();
      const tokens = await auth.getAccessToken();

      // Ensure output directory exists
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      // Download with authorization header
      const response = await axios({
        method: 'GET',
        url,
        responseType: 'stream',
        headers: {
          'Authorization': `Bearer ${tokens.token}`,
        },
      });

      // Save to file
      const writer = (await fs.open(outputPath, 'w')).createWriteStream();
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(outputPath));
        writer.on('error', reject);
      });
    } catch (error) {
      console.error(`Error downloading from URL ${url}:`, error);
      throw error;
    }
  }
}
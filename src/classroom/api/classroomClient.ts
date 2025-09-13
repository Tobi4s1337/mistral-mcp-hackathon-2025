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
    materials?: classroom_v1.Schema$Material[],
    assigneeMode?: 'ALL_STUDENTS' | 'INDIVIDUAL_STUDENTS',
    studentIds?: string[]
  ): Promise<classroom_v1.Schema$Announcement> {
    const classroom = await this.getClient();
    
    const requestBody: classroom_v1.Schema$Announcement = {
      text,
      materials,
      state: 'PUBLISHED',
      assigneeMode: assigneeMode || 'ALL_STUDENTS',
    };
    
    // Add individual students options if specified
    if (assigneeMode === 'INDIVIDUAL_STUDENTS' && studentIds && studentIds.length > 0) {
      requestBody.individualStudentsOptions = {
        studentIds: studentIds
      };
    }
    
    const response = await classroom.courses.announcements.create({
      courseId,
      requestBody,
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
    pageSize = 50,
    pageToken?: string,
    userId?: string
  ): Promise<classroom_v1.Schema$ListStudentSubmissionsResponse> {
    const classroom = await this.getClient();
    const response = await classroom.courses.courseWork.studentSubmissions.list({
      courseId,
      courseWorkId,
      userId,
      pageSize,
      pageToken,
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

  async createInvitation(
    courseId: string,
    userId: string,
    role: 'STUDENT' | 'TEACHER' = 'STUDENT'
  ): Promise<classroom_v1.Schema$Invitation> {
    const classroom = await this.getClient();
    const response = await classroom.invitations.create({
      requestBody: {
        courseId,
        userId,
        role,
      },
    });
    return response.data;
  }

  async setGradeAndFeedback(
    courseId: string,
    courseWorkId: string,
    submissionId: string,
    grade: number,
    feedback?: string,
    isDraft: boolean = false
  ): Promise<{
    submission: classroom_v1.Schema$StudentSubmission;
    feedbackAdded: boolean;
  }> {
    const classroom = await this.getClient();

    // Prepare update fields based on whether it's draft or final grade
    const updateFields: string[] = [];
    const requestBody: classroom_v1.Schema$StudentSubmission = {};

    if (isDraft) {
      updateFields.push('draftGrade');
      requestBody.draftGrade = grade;
    } else {
      updateFields.push('assignedGrade');
      requestBody.assignedGrade = grade;
    }

    // Update the submission with the grade
    const response = await classroom.courses.courseWork.studentSubmissions.patch({
      courseId,
      courseWorkId,
      id: submissionId,
      updateMask: updateFields.join(','),
      requestBody,
    });

    let feedbackAdded = false;

    // Add feedback as a private comment if provided
    if (feedback) {
      try {
        // First, ensure the submission is in RETURNED state to add teacher comments
        const currentSubmission = response.data;
        
        // If submission is TURNED_IN, we need to return it first
        if (currentSubmission.state === 'TURNED_IN') {
          await classroom.courses.courseWork.studentSubmissions.return({
            courseId,
            courseWorkId,
            id: submissionId,
          });
        }

        // Now add the feedback as a teacher comment
        // Note: The Google Classroom API doesn't have a direct comment endpoint in v1,
        // but we can use the Drive API to add comments to attached documents
        // For now, we'll mark feedback as not added directly
        console.log(`Feedback to be communicated separately: ${feedback}`);
        feedbackAdded = false;
      } catch (error) {
        console.error('Error adding feedback:', error);
        feedbackAdded = false;
      }
    }

    return {
      submission: response.data,
      feedbackAdded,
    };
  }

  async getStudentSubmissionByUserId(
    courseId: string,
    courseWorkId: string,
    userId: string
  ): Promise<classroom_v1.Schema$StudentSubmission | null> {
    const classroom = await this.getClient();
    
    const submissionsResponse = await classroom.courses.courseWork.studentSubmissions.list({
      courseId,
      courseWorkId,
      userId,
    });

    if (!submissionsResponse.data.studentSubmissions?.length) {
      return null;
    }

    return submissionsResponse.data.studentSubmissions[0];
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

  async uploadPDFToDrive(pdfPath: string, fileName: string, courseId?: string): Promise<drive_v3.Schema$File> {
    try {
      const drive = await this.getDriveClient();
      const { createReadStream } = await import('fs');

      // Create file metadata
      const fileMetadata: drive_v3.Schema$File = {
        name: fileName,
        mimeType: 'application/pdf',
      };

      // If courseId is provided, try to find the course folder
      if (courseId) {
        try {
          const classroom = await this.getClient();
          const course = await classroom.courses.get({ id: courseId });

          // Check if course has a drive folder
          if (course.data.teacherFolder?.id) {
            fileMetadata.parents = [course.data.teacherFolder.id];
          }
        } catch (error) {
          console.log('Could not get course folder, uploading to root:', error);
        }
      }

      // Create a read stream for the PDF file
      const fileStream = createReadStream(pdfPath);

      // Upload file to Drive
      const response = await drive.files.create({
        requestBody: fileMetadata,
        media: {
          mimeType: 'application/pdf',
          body: fileStream,
        },
        fields: 'id,name,webViewLink,webContentLink',
      });

      // Share the file with anyone with the link
      await drive.permissions.create({
        fileId: response.data.id!,
        requestBody: {
          type: 'anyone',
          role: 'reader',
        },
      });

      return response.data;
    } catch (error) {
      console.error('Error uploading PDF to Drive:', error);
      throw error;
    }
  }

  async uploadPDFFromUrl(pdfUrl: string, fileName: string, courseId?: string): Promise<drive_v3.Schema$File> {
    try {
      // Download PDF to temp location
      const tempPath = path.join('/tmp', `${Date.now()}_${fileName}`);

      // Download the PDF
      const response = await axios({
        method: 'GET',
        url: pdfUrl,
        responseType: 'arraybuffer',
      });

      // Save to temp file
      await fs.writeFile(tempPath, response.data);

      // Upload to Drive
      const driveFile = await this.uploadPDFToDrive(tempPath, fileName, courseId);

      // Clean up temp file
      await fs.unlink(tempPath).catch(console.error);

      return driveFile;
    } catch (error) {
      console.error('Error uploading PDF from URL:', error);
      throw error;
    }
  }

  async modifyAssignees(
    courseId: string,
    courseWorkId: string,
    assigneeMode: 'ALL_STUDENTS' | 'INDIVIDUAL_STUDENTS',
    studentIds?: string[]
  ): Promise<classroom_v1.Schema$CourseWork> {
    const classroom = await this.getClient();

    const requestBody: any = {
      assigneeMode,
    };

    if (assigneeMode === 'INDIVIDUAL_STUDENTS' && studentIds) {
      requestBody.modifyIndividualStudentsOptions = {
        addStudentIds: studentIds,
      };
    }

    const response = await classroom.courses.courseWork.modifyAssignees({
      courseId,
      id: courseWorkId,
      requestBody,
    });

    return response.data;
  }
}
import { ClassroomClient } from '../api/classroomClient.js';
import { classroom_v1 } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';

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

  async downloadAssignment(
    courseId: string,
    assignmentId: string,
    downloadPath = './downloads'
  ): Promise<{
    assignment: classroom_v1.Schema$CourseWork;
    materials: classroom_v1.Schema$Material[];
    downloadedFiles: string[];
  }> {
    const assignment = await this.client.getCourseWork(courseId, assignmentId);

    // Extract materials/attachments from the assignment
    const materials = assignment.materials || [];
    const downloadedFiles: string[] = [];

    // Create download directory structure
    const assignmentDir = path.join(
      downloadPath,
      'assignments',
      `${courseId}`,
      `${assignmentId}_${assignment.title?.replace(/[^a-z0-9]/gi, '_') || 'assignment'}`
    );
    await fs.mkdir(assignmentDir, { recursive: true });

    // Download each material
    for (const material of materials) {
      try {
        if (material.driveFile?.driveFile?.id) {
          const fileId = material.driveFile.driveFile.id;
          const fileName = material.driveFile.driveFile.title || 'file';
          const outputPath = path.join(assignmentDir, `${fileName}`);

          const downloadedPath = await this.client.downloadFile(fileId, outputPath);
          downloadedFiles.push(downloadedPath);
          console.log(`Downloaded assignment file: ${downloadedPath}`);
        } else if (material.link?.url) {
          // Save link information
          const linkFile = path.join(assignmentDir, 'links.json');
          const links = [];
          try {
            const existing = await fs.readFile(linkFile, 'utf-8');
            links.push(...JSON.parse(existing));
          } catch {}
          links.push({ title: material.link.title, url: material.link.url });
          await fs.writeFile(linkFile, JSON.stringify(links, null, 2));
        }
      } catch (error) {
        console.error(`Error downloading material:`, error);
      }
    }

    // Save assignment metadata
    const metadataPath = path.join(assignmentDir, 'assignment.json');
    await fs.writeFile(metadataPath, JSON.stringify(assignment, null, 2));
    downloadedFiles.push(metadataPath);

    return {
      assignment,
      materials,
      downloadedFiles
    };
  }

  async downloadSubmission(
    courseId: string,
    assignmentId: string,
    submissionId: string,
    downloadPath = './downloads'
  ): Promise<{
    submission: classroom_v1.Schema$StudentSubmission;
    attachments: classroom_v1.Schema$Attachment[];
    downloadedFiles: string[];
  }> {
    const submission = await this.client.getStudentSubmission(
      courseId,
      assignmentId,
      submissionId
    );

    // Extract attachments from the submission
    const attachments = submission.assignmentSubmission?.attachments || [];
    const downloadedFiles: string[] = [];

    // Create download directory structure
    const submissionDir = path.join(
      downloadPath,
      'submissions',
      `${courseId}`,
      `${assignmentId}`,
      `${submissionId}_${submission.userId || 'unknown'}`
    );
    await fs.mkdir(submissionDir, { recursive: true });

    // Download each attachment
    for (const attachment of attachments) {
      try {
        if (attachment.driveFile?.id) {
          const fileId = attachment.driveFile.id;
          const fileName = attachment.driveFile.title || 'file';
          const outputPath = path.join(submissionDir, `${fileName}`);

          const downloadedPath = await this.client.downloadFile(fileId, outputPath);
          downloadedFiles.push(downloadedPath);
          console.log(`Downloaded submission file: ${downloadedPath}`);
        } else if (attachment.link?.url) {
          // Save link information
          const linkFile = path.join(submissionDir, 'links.json');
          const links = [];
          try {
            const existing = await fs.readFile(linkFile, 'utf-8');
            links.push(...JSON.parse(existing));
          } catch {}
          links.push({ title: attachment.link.title, url: attachment.link.url });
          await fs.writeFile(linkFile, JSON.stringify(links, null, 2));
        }
      } catch (error) {
        console.error(`Error downloading attachment:`, error);
      }
    }

    // Save submission metadata
    const metadataPath = path.join(submissionDir, 'submission.json');
    await fs.writeFile(metadataPath, JSON.stringify(submission, null, 2));
    downloadedFiles.push(metadataPath);

    return {
      submission,
      attachments,
      downloadedFiles
    };
  }

  async downloadAllSubmissions(
    courseId: string,
    assignmentId: string,
    downloadPath = './downloads'
  ): Promise<{
    assignment: classroom_v1.Schema$CourseWork;
    submissions: Array<{
      submission: classroom_v1.Schema$StudentSubmission;
      attachments: classroom_v1.Schema$Attachment[];
      downloadedFiles: string[];
    }>;
    totalDownloadedFiles: string[];
  }> {
    // Get the assignment details
    const assignment = await this.client.getCourseWork(courseId, assignmentId);
    const totalDownloadedFiles: string[] = [];

    // Get all submissions for this assignment
    const submissionsResponse = await this.client.listStudentSubmissions(
      courseId,
      assignmentId
    );

    const submissions = await Promise.all(
      (submissionsResponse.studentSubmissions || []).map(async (submission) => {
        if (!submission.id) {
          return {
            submission,
            attachments: [],
            downloadedFiles: []
          };
        }

        try {
          const result = await this.downloadSubmission(
            courseId,
            assignmentId,
            submission.id,
            downloadPath
          );
          totalDownloadedFiles.push(...result.downloadedFiles);
          return result;
        } catch (error) {
          console.error(`Error downloading submission ${submission.id}:`, error);
          return {
            submission,
            attachments: submission.assignmentSubmission?.attachments || [],
            downloadedFiles: []
          };
        }
      })
    );

    return {
      assignment,
      submissions,
      totalDownloadedFiles
    };
  }

  async downloadAllCourseSubmissions(
    courseId: string,
    downloadPath = './downloads'
  ): Promise<{
    results: Array<{
      assignment: classroom_v1.Schema$CourseWork;
      submissions: Array<{
        submission: classroom_v1.Schema$StudentSubmission;
        attachments: classroom_v1.Schema$Attachment[];
        downloadedFiles: string[];
      }>;
      totalDownloadedFiles: string[];
    }>;
    allDownloadedFiles: string[];
  }> {
    // Get all assignments for the course
    const assignments = await this.getAllAssignments(courseId);
    const allDownloadedFiles: string[] = [];

    // For each assignment, download all submissions
    const results = await Promise.all(
      assignments.map(async (assignment) => {
        if (!assignment.id) {
          return {
            assignment,
            submissions: [],
            totalDownloadedFiles: []
          };
        }

        try {
          const result = await this.downloadAllSubmissions(
            courseId,
            assignment.id,
            downloadPath
          );
          allDownloadedFiles.push(...result.totalDownloadedFiles);
          return result;
        } catch (error) {
          console.error(`Error downloading submissions for assignment ${assignment.id}:`, error);
          return {
            assignment,
            submissions: [],
            totalDownloadedFiles: []
          };
        }
      })
    );

    // Create summary file
    const summaryPath = path.join(downloadPath, 'submissions', courseId, 'summary.json');
    await fs.mkdir(path.dirname(summaryPath), { recursive: true });
    await fs.writeFile(
      summaryPath,
      JSON.stringify(
        {
          courseId,
          totalAssignments: assignments.length,
          totalSubmissions: results.reduce((sum, r) => sum + r.submissions.length, 0),
          totalFiles: allDownloadedFiles.length,
          downloadDate: new Date().toISOString()
        },
        null,
        2
      )
    );
    allDownloadedFiles.push(summaryPath);

    return {
      results,
      allDownloadedFiles
    };
  }
}
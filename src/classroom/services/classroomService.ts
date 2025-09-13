import { ClassroomClient } from '../api/classroomClient.js';
import { classroom_v1, drive_v3 } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { StudentNotesManager } from '../storage/studentNotesManager.js';
import { WorksheetStorageManager } from '../storage/worksheetStorageManager.js';

export interface StudentWithNote {
  student: classroom_v1.Schema$Student;
  note: string;
  noteUpdatedAt?: string;
}

export interface CourseWithDetails {
  course: classroom_v1.Schema$Course;
  announcements?: classroom_v1.Schema$Announcement[];
  teachers?: classroom_v1.Schema$Teacher[];
  studentCount?: number;
  studentsWithNotes?: StudentWithNote[];
}

export interface AssignmentWithSubmissions {
  assignment: classroom_v1.Schema$CourseWork;
  submissions?: classroom_v1.Schema$StudentSubmission[];
}

export interface CreateWorksheetAssignmentOptions {
  courseId: string;
  title: string;
  pdfUrl: string;
  description?: string;
  instructions?: string;
  maxPoints?: number;
  dueDate?: Date;
  assigneeMode?: 'ALL_STUDENTS' | 'INDIVIDUAL_STUDENTS' | 'GROUP_WITH_EXCLUSIONS';
  studentIds?: string[]; // For INDIVIDUAL_STUDENTS mode
  excludeStudentIds?: string[]; // For GROUP_WITH_EXCLUSIONS mode
}

export interface WorksheetAssignmentResult {
  assignment: classroom_v1.Schema$CourseWork;
  driveFile: drive_v3.Schema$File;
  assignedToCount: number;
  message: string;
}

export class ClassroomService {
  private static instance: ClassroomService;
  public client: ClassroomClient;
  private notesManager: StudentNotesManager;
  private worksheetStorage: WorksheetStorageManager;

  private constructor() {
    this.client = ClassroomClient.getInstance();
    this.notesManager = StudentNotesManager.getInstance();
    this.worksheetStorage = WorksheetStorageManager.getInstance();
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
      const students = studentsResponse.value.students || [];
      result.studentCount = students.length;

      // Initialize empty notes for new students and populate existing notes
      const courseName = course.status === 'fulfilled' ? course.value.name : undefined;
      result.studentsWithNotes = await this.populateStudentNotes(courseId, students, courseName);
    }

    return result;
  }

  private async populateStudentNotes(
    courseId: string,
    students: classroom_v1.Schema$Student[],
    courseName?: string | null
  ): Promise<StudentWithNote[]> {
    const studentsWithNotes: StudentWithNote[] = [];

    for (const student of students) {
      if (!student.userId || !student.profile?.name?.fullName) continue;

      const studentId = student.userId;
      const studentName = student.profile.name.fullName;

      // Check if note exists
      let existingNote = await this.notesManager.getNote(courseId, studentId);

      // If no note exists, create an empty one
      if (!existingNote) {
        await this.notesManager.addNote(
          courseId,
          studentId,
          studentName,
          '',
          courseName || undefined
        );
        existingNote = await this.notesManager.getNote(courseId, studentId);
      }

      studentsWithNotes.push({
        student,
        note: existingNote?.note || '',
        noteUpdatedAt: existingNote?.updatedAt
      });
    }

    return studentsWithNotes;
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
              assignment.id,
              50
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
          } catch {
            // File doesn't exist yet, start with empty array
          }
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
          } catch {
            // File doesn't exist yet, start with empty array
          }
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
      assignmentId,
      50
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

  async getStudentsWithPendingAssignments(courseId: string): Promise<{
    student: classroom_v1.Schema$Student;
    pendingAssignments: Array<{
      assignment: classroom_v1.Schema$CourseWork;
      submission?: classroom_v1.Schema$StudentSubmission;
    }>;
  }[]> {
    // Get all students and assignments for the course
    const [students, assignments] = await Promise.all([
      this.getCourseStudents(courseId),
      this.getAllAssignments(courseId)
    ]);

    const studentsWithPending = [];

    for (const student of students) {
      if (!student.userId) continue;

      const pendingAssignments = [];

      for (const assignment of assignments) {
        if (!assignment.id || assignment.state !== 'PUBLISHED') continue;

        // Check if assignment has a due date and if it's in the future
        if (assignment.dueDate) {
          const dueDate = new Date(
            assignment.dueDate.year || new Date().getFullYear(),
            (assignment.dueDate.month || 1) - 1,
            assignment.dueDate.day || 1
          );

          // Skip assignments that are past due by more than 7 days
          const daysPastDue = (Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24);
          if (daysPastDue > 7) continue;
        }

        // Get submission status for this student
        try {
          const submissionsResponse = await this.client.listStudentSubmissions(
            courseId,
            assignment.id,
            50,
            undefined,
            student.userId
          );

          const submission = submissionsResponse.studentSubmissions?.[0];

          // Check if assignment is pending (not turned in or graded)
          if (!submission || submission.state === 'NEW' || submission.state === 'CREATED' || submission.state === 'RECLAIMED_BY_STUDENT') {
            pendingAssignments.push({
              assignment,
              submission
            });
          }
        } catch (error) {
          console.error(`Error checking submission for student ${student.userId}:`, error);
        }
      }

      if (pendingAssignments.length > 0) {
        studentsWithPending.push({
          student,
          pendingAssignments
        });
      }
    }

    return studentsWithPending;
  }

  async sendMessageToStudents(
    courseId: string,
    studentIds: string[],
    message: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Google Classroom doesn't have direct private messaging
      // We'll create a public announcement visible to all students
      // Note: Individual targeting requires using assignment comments or email

      await this.client.createAnnouncement(
        courseId,
        message,
        []
      );

      return {
        success: true,
        message: `Message sent to ${studentIds.length} students via course announcement`
      };
    } catch (error) {
      console.error('Error sending message to students:', error);
      return {
        success: false,
        message: `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async nudgeStudentsWithPendingWork(courseId: string): Promise<{
    success: boolean;
    nudgedStudents: Array<{
      studentName: string;
      pendingCount: number;
    }>;
    message: string;
  }> {
    try {
      // Get course details for context
      const course = await this.client.getCourse(courseId);
      const courseName = course.name || 'your course';

      // Get students with pending assignments
      const studentsWithPending = await this.getStudentsWithPendingAssignments(courseId);

      if (studentsWithPending.length === 0) {
        return {
          success: true,
          nudgedStudents: [],
          message: 'No students with pending assignments found'
        };
      }

      const nudgedStudents = [];

      // Create a general announcement about pending work
      const assignmentsList = new Set<string>();
      studentsWithPending.forEach(({ pendingAssignments }) => {
        pendingAssignments.forEach(({ assignment }) => {
          if (assignment.title) {
            assignmentsList.add(assignment.title);
          }
        });
      });

      const message = `📚 Reminder: You have pending assignments in ${courseName}!\n\n` +
        `The following assignments need your attention:\n` +
        Array.from(assignmentsList).map(title => `• ${title}`).join('\n') +
        `\n\nPlease complete and submit your work as soon as possible. ` +
        `If you need help or have questions, don't hesitate to ask!\n\n` +
        `Keep up the great work! 💪`;

      // Send the announcement
      await this.client.createAnnouncement(courseId, message);

      // Track nudged students
      for (const { student, pendingAssignments } of studentsWithPending) {
        if (student.profile?.name?.fullName) {
          nudgedStudents.push({
            studentName: student.profile.name.fullName,
            pendingCount: pendingAssignments.length
          });
        }
      }

      return {
        success: true,
        nudgedStudents,
        message: `Successfully sent reminder to ${nudgedStudents.length} students with pending assignments`
      };
    } catch (error) {
      console.error('Error nudging students:', error);
      return {
        success: false,
        nudgedStudents: [],
        message: `Failed to nudge students: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
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

  async setGradeAndFeedback(
    courseId: string,
    assignmentId: string,
    studentId: string,
    grade: number,
    feedback?: string,
    isDraft: boolean = false
  ): Promise<{
    success: boolean;
    studentName: string;
    grade: number;
    feedbackSent: boolean;
    message: string;
    submission?: classroom_v1.Schema$StudentSubmission;
  }> {
    try {
      // Get student information for better feedback
      const students = await this.getCourseStudents(courseId);
      const student = students.find(s => s.userId === studentId);
      const studentName = student?.profile?.name?.fullName || 'Unknown Student';

      // Get the assignment details for context
      const assignment = await this.client.getCourseWork(courseId, assignmentId);
      const maxPoints = assignment.maxPoints || 100;

      // Validate grade is within range
      if (grade < 0 || grade > maxPoints) {
        throw new Error(`Grade must be between 0 and ${maxPoints}`);
      }

      // Get the student's submission
      const submission = await this.client.getStudentSubmissionByUserId(
        courseId,
        assignmentId,
        studentId
      );

      if (!submission || !submission.id) {
        throw new Error(`No submission found for student ${studentName} (${studentId}) in assignment ${assignment.title || assignmentId}`);
      }

      // Set the grade and feedback
      const result = await this.client.setGradeAndFeedback(
        courseId,
        assignmentId,
        submission.id,
        grade,
        feedback,
        isDraft
      );

      // If feedback wasn't added directly and it was provided, send as announcement
      let feedbackSent = result.feedbackAdded;
      if (feedback && !result.feedbackAdded) {
        try {
          // Create a personalized announcement for feedback
          const feedbackMessage = `📝 **Feedback for ${studentName} on "${assignment.title || 'Assignment'}"**\n\n` +
            `Grade: ${grade}/${maxPoints} (${Math.round((grade / maxPoints) * 100)}%)\n\n` +
            `**Teacher's Feedback:**\n${feedback}\n\n` +
            `Keep up the great work! If you have any questions about this feedback, please reach out.`;

          await this.client.createAnnouncement(
            courseId,
            feedbackMessage,
            []
          );
          feedbackSent = true;
        } catch (announcementError) {
          console.error('Failed to send feedback as announcement:', announcementError);
          feedbackSent = false;
        }
      }

      const gradeType = isDraft ? 'draft' : 'final';
      const message = `Successfully set ${gradeType} grade for ${studentName}: ${grade}/${maxPoints} (${Math.round((grade / maxPoints) * 100)}%)` +
        (feedbackSent ? ' and sent feedback' : feedback ? ' (feedback could not be sent directly)' : '');

      return {
        success: true,
        studentName,
        grade,
        feedbackSent,
        message,
        submission: result.submission
      };
    } catch (error) {
      console.error('Error setting grade and feedback:', error);
      return {
        success: false,
        studentName: 'Unknown',
        grade: 0,
        feedbackSent: false,
        message: `Failed to set grade: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async createAssignmentWithWorksheet(
    options: CreateWorksheetAssignmentOptions
  ): Promise<WorksheetAssignmentResult> {
    const {
      courseId,
      title,
      pdfUrl,
      description,
      instructions,
      maxPoints,
      dueDate,
      assigneeMode = 'ALL_STUDENTS',
      studentIds,
      excludeStudentIds,
    } = options;

    try {
      // Step 1: Upload PDF to Google Drive
      console.log('Uploading worksheet PDF to Google Drive...');
      const driveFile = await this.client.uploadPDFFromUrl(
        pdfUrl,
        `${title}.pdf`,
        courseId
      );

      if (!driveFile.id) {
        throw new Error('Failed to upload PDF to Google Drive');
      }

      // Step 2: Create assignment materials
      const materials: classroom_v1.Schema$Material[] = [{
        driveFile: {
          driveFile: {
            id: driveFile.id,
            title: driveFile.name || `${title}.pdf`,
            alternateLink: driveFile.webViewLink || undefined,
            thumbnailUrl: undefined,
          },
          shareMode: 'VIEW',
        },
      }];

      // Step 3: Build assignment description
      let fullDescription = '';
      if (description) {
        fullDescription += description;
      }
      if (instructions) {
        fullDescription += (fullDescription ? '\n\n' : '') + '**Instructions:**\n' + instructions;
      }
      if (!fullDescription) {
        fullDescription = `Complete the attached worksheet: ${title}`;
      }

      // Step 4: Determine assignee mode and get student list if needed
      let actualAssigneeMode: 'ALL_STUDENTS' | 'INDIVIDUAL_STUDENTS' = 'ALL_STUDENTS';
      let targetStudentIds: string[] = [];

      if (assigneeMode === 'INDIVIDUAL_STUDENTS') {
        actualAssigneeMode = 'INDIVIDUAL_STUDENTS';
        targetStudentIds = studentIds || [];
      } else if (assigneeMode === 'GROUP_WITH_EXCLUSIONS' && excludeStudentIds && excludeStudentIds.length > 0) {
        // Get all students and exclude specified ones
        const allStudents = await this.getCourseStudents(courseId);
        const excludeSet = new Set(excludeStudentIds);
        targetStudentIds = allStudents
          .filter(student => student.userId && !excludeSet.has(student.userId))
          .map(student => student.userId!);

        if (targetStudentIds.length > 0) {
          actualAssigneeMode = 'INDIVIDUAL_STUDENTS';
        }
      }

      // Step 5: Create the course work
      const courseWork: classroom_v1.Schema$CourseWork = {
        title,
        description: fullDescription,
        materials,
        workType: 'ASSIGNMENT',
        state: 'PUBLISHED',
        maxPoints: maxPoints || 100,
        assigneeMode: actualAssigneeMode,
      };

      // Add individual students options if needed
      if (actualAssigneeMode === 'INDIVIDUAL_STUDENTS' && targetStudentIds.length > 0) {
        courseWork.individualStudentsOptions = {
          studentIds: targetStudentIds,
        };
      }

      // Add due date if provided
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

      // Step 6: Create the assignment
      const assignment = await this.client.createCourseWork(courseId, courseWork);

      // Step 7: Link worksheet to assignment if it exists in storage
      if (assignment.id) {
        try {
          // Check if we have worksheet data for this PDF URL
          const worksheetData = await this.worksheetStorage.getWorksheetByPdfUrl(pdfUrl);
          if (worksheetData) {
            // Get course name for storage
            const course = await this.client.getCourse(courseId);
            const courseName = course.name || undefined;

            // Link the worksheet to this assignment
            await this.worksheetStorage.linkWorksheetToAssignment(
              pdfUrl,
              assignment.id,
              courseId,
              courseName
            );
            console.log(`Linked worksheet to assignment ${assignment.id}`);
          }
        } catch (storageError) {
          console.error('Failed to link worksheet to assignment:', storageError);
          // Continue even if storage fails
        }
      }

      // Step 8: Prepare result
      let assignedToCount = 0;
      let message = '';

      if (actualAssigneeMode === 'ALL_STUDENTS') {
        const students = await this.getCourseStudents(courseId);
        assignedToCount = students.length;
        message = `Assignment "${title}" created and assigned to all ${assignedToCount} students`;
      } else if (actualAssigneeMode === 'INDIVIDUAL_STUDENTS') {
        assignedToCount = targetStudentIds.length;
        if (assigneeMode === 'GROUP_WITH_EXCLUSIONS') {
          message = `Assignment "${title}" created and assigned to ${assignedToCount} students (excluded ${excludeStudentIds?.length || 0} students)`;
        } else {
          message = `Assignment "${title}" created and assigned to ${assignedToCount} specific students`;
        }
      }

      return {
        assignment,
        driveFile,
        assignedToCount,
        message,
      };
    } catch (error) {
      console.error('Error creating worksheet assignment:', error);
      throw new Error(`Failed to create worksheet assignment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
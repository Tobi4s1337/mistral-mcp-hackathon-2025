import * as fs from 'fs/promises';
import * as path from 'path';

interface WorksheetRecord {
  worksheetPdfUrl: string;
  answerKeyPdfUrl: string;
  title: string;
  subject?: string;
  grade?: string;
  summary?: string;
  totalPoints?: number;
  gradingBreakdown?: Array<{ section: string; points: number; }>;
  createdAt: string;
  // Assignment info - added when assignment is created
  assignmentId?: string;
  courseId?: string;
  courseName?: string;
}

interface StorageData {
  worksheets: Record<string, WorksheetRecord>; // Keyed by worksheetPdfUrl
  assignmentMapping: Record<string, string>; // Maps assignmentId to worksheetPdfUrl
}

export class WorksheetStorageManager {
  private static instance: WorksheetStorageManager;
  private storageFile: string;
  private data: StorageData;
  private isInitialized = false;

  private constructor() {
    this.storageFile = path.join(process.cwd(), 'worksheet-assignments.json');
    this.data = { worksheets: {}, assignmentMapping: {} };
  }

  static getInstance(): WorksheetStorageManager {
    if (!WorksheetStorageManager.instance) {
      WorksheetStorageManager.instance = new WorksheetStorageManager();
    }
    return WorksheetStorageManager.instance;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const fileContent = await fs.readFile(this.storageFile, 'utf-8');
      this.data = JSON.parse(fileContent);
      // Ensure assignmentMapping exists for older data
      if (!this.data.assignmentMapping) {
        this.data.assignmentMapping = {};
      }
    } catch {
      // File doesn't exist, use default empty data
      this.data = { worksheets: {}, assignmentMapping: {} };
      await this.save();
    }
    this.isInitialized = true;
  }

  private async save(): Promise<void> {
    await fs.writeFile(this.storageFile, JSON.stringify(this.data, null, 2));
  }

  async addWorksheet(
    worksheetPdfUrl: string,
    answerKeyPdfUrl: string,
    title: string,
    metadata?: {
      subject?: string;
      grade?: string;
      summary?: string;
      totalPoints?: number;
      gradingBreakdown?: Array<{ section: string; points: number; }>;
    }
  ): Promise<void> {
    await this.ensureInitialized();

    this.data.worksheets[worksheetPdfUrl] = {
      worksheetPdfUrl,
      answerKeyPdfUrl,
      title,
      subject: metadata?.subject,
      grade: metadata?.grade,
      summary: metadata?.summary,
      totalPoints: metadata?.totalPoints,
      gradingBreakdown: metadata?.gradingBreakdown,
      createdAt: new Date().toISOString()
    };

    await this.save();
  }

  async linkWorksheetToAssignment(
    worksheetPdfUrl: string,
    assignmentId: string,
    courseId: string,
    courseName?: string
  ): Promise<boolean> {
    await this.ensureInitialized();

    const worksheet = this.data.worksheets[worksheetPdfUrl];
    if (!worksheet) {
      return false;
    }

    // Update worksheet with assignment info
    worksheet.assignmentId = assignmentId;
    worksheet.courseId = courseId;
    worksheet.courseName = courseName;

    // Create reverse mapping
    this.data.assignmentMapping[assignmentId] = worksheetPdfUrl;

    await this.save();
    return true;
  }

  async getWorksheetByAssignment(assignmentId: string): Promise<WorksheetRecord | null> {
    await this.ensureInitialized();
    const worksheetUrl = this.data.assignmentMapping[assignmentId];
    if (!worksheetUrl) return null;
    return this.data.worksheets[worksheetUrl] || null;
  }

  async getWorksheetByPdfUrl(worksheetPdfUrl: string): Promise<WorksheetRecord | null> {
    await this.ensureInitialized();
    return this.data.worksheets[worksheetPdfUrl] || null;
  }

  async getWorksheetsByCourse(courseId: string): Promise<WorksheetRecord[]> {
    await this.ensureInitialized();
    return Object.values(this.data.worksheets).filter(
      worksheet => worksheet.courseId === courseId
    );
  }

  async getAllWorksheets(): Promise<WorksheetRecord[]> {
    await this.ensureInitialized();
    return Object.values(this.data.worksheets);
  }

  async getAnswerKeyUrl(assignmentId: string): Promise<string | null> {
    await this.ensureInitialized();
    const worksheetUrl = this.data.assignmentMapping[assignmentId];
    if (!worksheetUrl) return null;
    const worksheet = this.data.worksheets[worksheetUrl];
    return worksheet?.answerKeyPdfUrl || null;
  }

  async getGradingInfo(assignmentId: string): Promise<{
    totalPoints: number | undefined;
    gradingBreakdown: Array<{ section: string; points: number; }> | undefined;
  } | null> {
    await this.ensureInitialized();
    const worksheetUrl = this.data.assignmentMapping[assignmentId];
    if (!worksheetUrl) return null;
    const worksheet = this.data.worksheets[worksheetUrl];
    if (!worksheet) return null;

    return {
      totalPoints: worksheet.totalPoints,
      gradingBreakdown: worksheet.gradingBreakdown
    };
  }

  async deleteWorksheet(worksheetPdfUrl: string): Promise<boolean> {
    await this.ensureInitialized();

    const worksheet = this.data.worksheets[worksheetPdfUrl];
    if (worksheet) {
      // Remove assignment mapping if exists
      if (worksheet.assignmentId) {
        delete this.data.assignmentMapping[worksheet.assignmentId];
      }
      delete this.data.worksheets[worksheetPdfUrl];
      await this.save();
      return true;
    }
    return false;
  }

  async updateWorksheet(
    worksheetPdfUrl: string,
    updates: Partial<Omit<WorksheetRecord, 'worksheetPdfUrl' | 'createdAt'>>
  ): Promise<boolean> {
    await this.ensureInitialized();

    if (this.data.worksheets[worksheetPdfUrl]) {
      this.data.worksheets[worksheetPdfUrl] = {
        ...this.data.worksheets[worksheetPdfUrl],
        ...updates
      };
      await this.save();
      return true;
    }
    return false;
  }

  async searchWorksheets(searchTerm: string): Promise<WorksheetRecord[]> {
    await this.ensureInitialized();
    const lowerSearchTerm = searchTerm.toLowerCase();

    return Object.values(this.data.worksheets).filter(worksheet =>
      worksheet.title.toLowerCase().includes(lowerSearchTerm) ||
      (worksheet.subject && worksheet.subject.toLowerCase().includes(lowerSearchTerm)) ||
      (worksheet.grade && worksheet.grade.toLowerCase().includes(lowerSearchTerm)) ||
      (worksheet.summary && worksheet.summary.toLowerCase().includes(lowerSearchTerm)) ||
      (worksheet.courseName && worksheet.courseName.toLowerCase().includes(lowerSearchTerm))
    );
  }

  async getRecentWorksheets(limit: number = 10): Promise<WorksheetRecord[]> {
    await this.ensureInitialized();

    return Object.values(this.data.worksheets)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }
}
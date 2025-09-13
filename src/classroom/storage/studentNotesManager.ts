import * as fs from 'fs/promises';
import * as path from 'path';

interface StudentNote {
  studentId: string;
  studentName: string;
  courseId: string;
  courseName?: string;
  note: string;
  updatedAt: string;
}

interface StorageData {
  notes: Record<string, StudentNote>;
}

export class StudentNotesManager {
  private static instance: StudentNotesManager;
  private storageFile: string;
  private data: StorageData;
  private isInitialized = false;

  private constructor() {
    this.storageFile = path.join(process.cwd(), 'student-notes.json');
    this.data = { notes: {} };
  }

  static getInstance(): StudentNotesManager {
    if (!StudentNotesManager.instance) {
      StudentNotesManager.instance = new StudentNotesManager();
    }
    return StudentNotesManager.instance;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const fileContent = await fs.readFile(this.storageFile, 'utf-8');
      this.data = JSON.parse(fileContent);
    } catch {
      // File doesn't exist, use default empty data
      this.data = { notes: {} };
      await this.save();
    }
    this.isInitialized = true;
  }

  private async save(): Promise<void> {
    await fs.writeFile(this.storageFile, JSON.stringify(this.data, null, 2));
  }

  private generateKey(courseId: string, studentId: string): string {
    return `${courseId}:${studentId}`;
  }

  private validateNoteLength(note: string): void {
    // Rough estimate: 3 sentences ≈ 300 characters max
    if (note.length > 300) {
      throw new Error('Note should not exceed 3 sentences (approximately 300 characters)');
    }
  }

  async addNote(
    courseId: string,
    studentId: string,
    studentName: string,
    note: string,
    courseName?: string
  ): Promise<void> {
    await this.ensureInitialized();
    this.validateNoteLength(note);

    const key = this.generateKey(courseId, studentId);
    this.data.notes[key] = {
      studentId,
      studentName,
      courseId,
      courseName,
      note,
      updatedAt: new Date().toISOString()
    };

    await this.save();
  }

  async getNote(courseId: string, studentId: string): Promise<StudentNote | null> {
    await this.ensureInitialized();
    const key = this.generateKey(courseId, studentId);
    return this.data.notes[key] || null;
  }

  async getCourseNotes(courseId: string): Promise<StudentNote[]> {
    await this.ensureInitialized();
    return Object.values(this.data.notes).filter(note => note.courseId === courseId);
  }

  async getAllNotes(): Promise<StudentNote[]> {
    await this.ensureInitialized();
    return Object.values(this.data.notes);
  }

  async deleteNote(courseId: string, studentId: string): Promise<boolean> {
    await this.ensureInitialized();
    const key = this.generateKey(courseId, studentId);

    if (this.data.notes[key]) {
      delete this.data.notes[key];
      await this.save();
      return true;
    }
    return false;
  }

  async updateNote(courseId: string, studentId: string, newNote: string): Promise<boolean> {
    await this.ensureInitialized();
    this.validateNoteLength(newNote);

    const key = this.generateKey(courseId, studentId);
    if (this.data.notes[key]) {
      this.data.notes[key].note = newNote;
      this.data.notes[key].updatedAt = new Date().toISOString();
      await this.save();
      return true;
    }
    return false;
  }

  async searchNotes(searchTerm: string): Promise<StudentNote[]> {
    await this.ensureInitialized();
    const lowerSearchTerm = searchTerm.toLowerCase();

    return Object.values(this.data.notes).filter(note =>
      note.note.toLowerCase().includes(lowerSearchTerm) ||
      note.studentName.toLowerCase().includes(lowerSearchTerm) ||
      (note.courseName && note.courseName.toLowerCase().includes(lowerSearchTerm))
    );
  }
}
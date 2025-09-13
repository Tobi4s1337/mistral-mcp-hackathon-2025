// Main exports for Google Classroom integration
export { AuthManager } from './auth/authManager.js';
export { ClassroomClient } from './api/classroomClient.js';
export { ClassroomService } from './services/classroomService.js';
export type {
  CourseWithDetails,
  AssignmentWithSubmissions,
  StudentWithNote,
  CreateWorksheetAssignmentOptions,
  WorksheetAssignmentResult
} from './services/classroomService.js';

// Storage management
export { StudentNotesManager } from './storage/studentNotesManager.js';
export { WorksheetStorageManager } from './storage/worksheetStorageManager.js';

// Export all tools
export * from './tools/index.js';
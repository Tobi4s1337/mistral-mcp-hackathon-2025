// Main exports for Google Classroom integration
export { AuthManager } from './auth/authManager.js';
export { ClassroomClient } from './api/classroomClient.js';
export { ClassroomService } from './services/classroomService.js';
export type { CourseWithDetails, AssignmentWithSubmissions } from './services/classroomService.js';

// Export all tools
export * from './tools/index.js';
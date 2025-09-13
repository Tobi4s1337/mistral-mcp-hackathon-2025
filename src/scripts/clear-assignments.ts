#!/usr/bin/env node

import { ClassroomService } from "../classroom/services/classroomService.js";
import { ClassroomClient } from "../classroom/api/classroomClient.js";
import readline from "readline";

const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  bold: "\x1b[1m"
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (question: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
};

async function clearAllAssignments() {
  try {
    console.log(`${colors.yellow}${colors.bold}⚠️  WARNING: Assignment Deletion Tool${colors.reset}`);
    console.log(`${colors.yellow}This will DELETE all assignments and submissions from ALL your Google Classrooms!${colors.reset}\n`);
    
    const service = ClassroomService.getInstance();
    const client = ClassroomClient.getInstance();
    
    // Get all courses
    console.log(`${colors.cyan}Fetching all courses...${colors.reset}`);
    const courses = await service.getAllCourses();
    
    if (courses.length === 0) {
      console.log(`${colors.green}No courses found. Nothing to delete.${colors.reset}`);
      process.exit(0);
    }
    
    // Display courses and count assignments
    console.log(`\n${colors.blue}Found ${courses.length} course(s):${colors.reset}`);
    
    let totalAssignments = 0;
    const courseAssignments: Array<{
      courseId: string;
      courseName: string;
      assignments: any[];
    }> = [];
    
    for (const course of courses) {
      if (!course.id) continue;
      
      const assignments = await service.getAllAssignments(course.id);
      const courseInfo = {
        courseId: course.id,
        courseName: course.name || "Unnamed Course",
        assignments
      };
      courseAssignments.push(courseInfo);
      totalAssignments += assignments.length;
      
      console.log(`  ${colors.dim}•${colors.reset} ${course.name} (${course.id}): ${colors.magenta}${assignments.length} assignment(s)${colors.reset}`);
    }
    
    if (totalAssignments === 0) {
      console.log(`\n${colors.green}No assignments found in any course. Nothing to delete.${colors.reset}`);
      process.exit(0);
    }
    
    console.log(`\n${colors.red}${colors.bold}Total assignments to delete: ${totalAssignments}${colors.reset}`);
    
    // Ask for confirmation
    const confirmation = await askQuestion(
      `\n${colors.yellow}Are you ABSOLUTELY SURE you want to delete all ${totalAssignments} assignments? ${colors.reset}${colors.red}This cannot be undone!${colors.reset}\n` +
      `Type ${colors.bold}'DELETE ALL'${colors.reset} to confirm (or anything else to cancel): `
    );
    
    if (confirmation !== "DELETE ALL") {
      console.log(`\n${colors.green}Cancelled. No assignments were deleted.${colors.reset}`);
      process.exit(0);
    }
    
    // Second confirmation for safety
    const secondConfirmation = await askQuestion(
      `\n${colors.red}${colors.bold}FINAL WARNING:${colors.reset} This will permanently delete ${totalAssignments} assignments and all student submissions!\n` +
      `Type ${colors.bold}'YES'${colors.reset} to proceed (or anything else to cancel): `
    );
    
    if (secondConfirmation !== "YES") {
      console.log(`\n${colors.green}Cancelled. No assignments were deleted.${colors.reset}`);
      process.exit(0);
    }
    
    // Delete assignments
    console.log(`\n${colors.red}Deleting assignments...${colors.reset}`);
    
    let deletedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];
    
    for (const courseInfo of courseAssignments) {
      if (courseInfo.assignments.length === 0) continue;
      
      console.log(`\n${colors.cyan}Processing course: ${courseInfo.courseName}${colors.reset}`);
      
      for (const assignment of courseInfo.assignments) {
        if (!assignment.id) continue;
        
        try {
          // Delete the assignment
          const classroom = await client.getClient();
          await classroom.courses.courseWork.delete({
            courseId: courseInfo.courseId,
            id: assignment.id
          });
          
          deletedCount++;
          console.log(`  ${colors.green}✓${colors.reset} Deleted: ${assignment.title || "Untitled"} ${colors.dim}(${assignment.id})${colors.reset}`);
        } catch (error: any) {
          failedCount++;
          const errorMsg = `Failed to delete "${assignment.title || assignment.id}" in ${courseInfo.courseName}: ${error.message}`;
          errors.push(errorMsg);
          console.log(`  ${colors.red}✗${colors.reset} ${errorMsg}`);
        }
      }
    }
    
    // Summary
    console.log(`\n${colors.bold}${colors.blue}========== SUMMARY ==========${colors.reset}`);
    console.log(`${colors.green}Successfully deleted: ${deletedCount} assignment(s)${colors.reset}`);
    
    if (failedCount > 0) {
      console.log(`${colors.red}Failed to delete: ${failedCount} assignment(s)${colors.reset}`);
      
      if (errors.length > 0) {
        console.log(`\n${colors.yellow}Errors:${colors.reset}`);
        errors.forEach(err => console.log(`  ${colors.dim}• ${err}${colors.reset}`));
      }
    }
    
    console.log(`\n${colors.green}✨ Cleanup complete!${colors.reset}`);
    
    // Clean up worksheet storage if it exists
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      
      const storageFile = path.join(process.cwd(), "worksheet-assignments.json");
      const exists = await fs.access(storageFile).then(() => true).catch(() => false);
      
      if (exists) {
        const backupFile = path.join(process.cwd(), `worksheet-assignments.backup.${Date.now()}.json`);
        await fs.rename(storageFile, backupFile);
        
        // Create empty storage
        await fs.writeFile(storageFile, JSON.stringify({ worksheets: {}, assignmentMapping: {} }, null, 2));
        
        console.log(`${colors.dim}Also cleared worksheet storage (backup saved as ${path.basename(backupFile)})${colors.reset}`);
      }
    } catch (error) {
      // Ignore storage cleanup errors
    }
    
  } catch (error) {
    console.error(`\n${colors.red}${colors.bold}Error:${colors.reset}`, error);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Run the script
console.log(`${colors.bold}${colors.magenta}Google Classroom Assignment Cleaner${colors.reset}`);
console.log(`${colors.dim}This tool helps you quickly clear all assignments for testing purposes.${colors.reset}\n`);

clearAllAssignments().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});
#!/usr/bin/env node

import { ClassroomService } from "../classroom/services/classroomService.js";
import { ClassroomClient } from "../classroom/api/classroomClient.js";

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

async function listAllAssignments() {
  try {
    console.log(`${colors.cyan}${colors.bold}📋 Listing All Assignments${colors.reset}\n`);
    
    const service = ClassroomService.getInstance();
    const client = ClassroomClient.getInstance();
    
    // Get all courses
    console.log(`${colors.cyan}Fetching courses...${colors.reset}`);
    const courses = await service.getAllCourses();
    
    if (courses.length === 0) {
      console.log(`${colors.yellow}No courses found.${colors.reset}`);
      return;
    }
    
    console.log(`Found ${colors.bold}${courses.length}${colors.reset} course(s)\n`);
    
    for (const course of courses) {
      if (!course.id) continue;
      
      console.log(`${colors.blue}${colors.bold}📚 ${course.name || "Unnamed Course"}${colors.reset}`);
      console.log(`${colors.dim}   Course ID: ${course.id}${colors.reset}`);
      console.log(`${colors.dim}   Section: ${course.section || "N/A"}${colors.reset}`);
      console.log(`${colors.dim}   State: ${course.courseState || "Unknown"}${colors.reset}`);
      
      try {
        const assignments = await service.getAllAssignments(course.id);
        
        if (assignments.length === 0) {
          console.log(`${colors.dim}   No assignments${colors.reset}`);
        } else {
          console.log(`${colors.green}   Assignments (${assignments.length}):${colors.reset}`);
          
          for (const assignment of assignments) {
            const creatorUserId = assignment.creatorUserId;
            const state = assignment.state;
            const workType = assignment.workType;
            const creationTime = assignment.creationTime ? new Date(assignment.creationTime).toLocaleString() : "Unknown";
            const updateTime = assignment.updateTime ? new Date(assignment.updateTime).toLocaleString() : "Unknown";
            
            console.log(`\n   ${colors.yellow}📄 ${assignment.title || "Untitled"}${colors.reset}`);
            console.log(`      ${colors.dim}ID: ${assignment.id}${colors.reset}`);
            console.log(`      ${colors.dim}State: ${state || "Unknown"}${colors.reset}`);
            console.log(`      ${colors.dim}Type: ${workType || "Unknown"}${colors.reset}`);
            console.log(`      ${colors.dim}Creator: ${creatorUserId || "Unknown"}${colors.reset}`);
            console.log(`      ${colors.dim}Created: ${creationTime}${colors.reset}`);
            console.log(`      ${colors.dim}Updated: ${updateTime}${colors.reset}`);
            
            if (assignment.maxPoints) {
              console.log(`      ${colors.dim}Max Points: ${assignment.maxPoints}${colors.reset}`);
            }
            
            if (assignment.dueDate) {
              const dueDate = new Date(
                assignment.dueDate.year || new Date().getFullYear(),
                (assignment.dueDate.month || 1) - 1,
                assignment.dueDate.day || 1
              );
              console.log(`      ${colors.dim}Due Date: ${dueDate.toLocaleDateString()}${colors.reset}`);
            }
            
            // Check if we can delete it
            if (state === 'DRAFT') {
              console.log(`      ${colors.yellow}⚠ Draft - might be deletable${colors.reset}`);
            } else if (state === 'PUBLISHED') {
              console.log(`      ${colors.green}✓ Published - should be deletable via API${colors.reset}`);
            } else if (state === 'DELETED') {
              console.log(`      ${colors.red}✗ Already deleted${colors.reset}`);
            }
            
            // Try to get submission count
            try {
              const submissions = await service.getStudentSubmissions(course.id, assignment.id!);
              const submittedCount = submissions.filter(s => 
                s.state === 'TURNED_IN' || s.state === 'RETURNED'
              ).length;
              
              if (submissions.length > 0) {
                console.log(`      ${colors.magenta}Submissions: ${submittedCount}/${submissions.length}${colors.reset}`);
              }
            } catch (error) {
              // Ignore submission fetch errors
            }
          }
        }
      } catch (error: any) {
        console.log(`   ${colors.red}Error fetching assignments: ${error.message}${colors.reset}`);
      }
      
      console.log(`\n${colors.dim}${"─".repeat(60)}${colors.reset}\n`);
    }
    
    // Check permissions
    console.log(`${colors.cyan}${colors.bold}Checking API Permissions...${colors.reset}\n`);
    
    try {
      const classroom = await client.getClient();
      
      // Try to create a test draft assignment to check permissions
      const testCourseId = courses[0].id;
      if (testCourseId) {
        try {
          const testAssignment = await classroom.courses.courseWork.create({
            courseId: testCourseId,
            requestBody: {
              title: "Permission Test (Delete Me)",
              description: "Testing API permissions",
              workType: 'ASSIGNMENT',
              state: 'DRAFT',
              maxPoints: 0,
            },
          });
          
          console.log(`${colors.green}✓ Can create assignments${colors.reset}`);
          
          // Try to delete it
          if (testAssignment.data.id) {
            try {
              await classroom.courses.courseWork.delete({
                courseId: testCourseId,
                id: testAssignment.data.id,
              });
              console.log(`${colors.green}✓ Can delete assignments (that were created via API)${colors.reset}`);
            } catch (deleteError: any) {
              console.log(`${colors.red}✗ Cannot delete assignments: ${deleteError.message}${colors.reset}`);
              
              // Try to update it to DELETED state instead
              try {
                await classroom.courses.courseWork.patch({
                  courseId: testCourseId,
                  id: testAssignment.data.id,
                  updateMask: 'state',
                  requestBody: {
                    state: 'DELETED',
                  },
                });
                console.log(`${colors.yellow}⚠ But can mark them as DELETED via patch${colors.reset}`);
              } catch (patchError) {
                console.log(`${colors.red}✗ Cannot patch assignment state either${colors.reset}`);
              }
            }
          }
        } catch (createError: any) {
          console.log(`${colors.red}✗ Cannot create assignments: ${createError.message}${colors.reset}`);
        }
      }
    } catch (error: any) {
      console.log(`${colors.red}Error checking permissions: ${error.message}${colors.reset}`);
    }
    
    console.log(`\n${colors.green}${colors.bold}✅ Complete!${colors.reset}`);
    
  } catch (error) {
    console.error(`\n${colors.red}${colors.bold}Error:${colors.reset}`, error);
  }
}

// Run the script
listAllAssignments().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});
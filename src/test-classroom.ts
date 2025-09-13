import { listCourses, getCourseDetails, getAssignments } from "./classroom/tools/index.js";
import { ClassroomService } from "./classroom/services/classroomService.js";
import fs from "fs/promises";
import path from "path";

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  dim: "\x1b[2m"
};

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`${colors.green}✓${colors.reset} ${name}`);
  } catch (error) {
    console.log(`${colors.red}✗${colors.reset} ${name}`);
    console.error(`  ${colors.dim}${error}${colors.reset}`);
    throw error;
  }
}

async function runTests() {
  console.log(`\n${colors.blue}Testing Google Classroom Features${colors.reset}\n`);
  console.log(`${colors.dim}Debug mode: Showing API responses${colors.reset}\n`);

  let courseId: string | undefined;
  let testsPassed = 0;
  let testsFailed = 0;

  try {
    await test("List all courses", async () => {
      const result = await listCourses();

      if (!result.content || result.content.length === 0) {
        throw new Error("Expected content array in response");
      }

      const content = result.content[0];
      if (content.type !== "text") {
        throw new Error("Expected text content type");
      }

      const data = JSON.parse(content.text);
      if (!Array.isArray(data.courses)) {
        throw new Error("Expected courses array in response");
      }

      if (data.courses.length > 0) {
        // Try the second course (History) first, then fall back to Math
        courseId = data.courses.length > 1 ? data.courses[1].id : data.courses[0].id;
        console.log(`  ${colors.dim}Found ${data.courses.length} course(s)${colors.reset}`);
        console.log(`  ${colors.dim}Courses: ${JSON.stringify(data.courses.map((c: any) => ({ id: c.id, name: c.name, courseState: c.courseState })), null, 2)}${colors.reset}`);
        console.log(`  ${colors.blue}Testing with course: ${data.courses.find((c: any) => c.id === courseId)?.name}${colors.reset}`);
      } else {
        console.log(`  ${colors.yellow}Warning: No courses found, skipping course-specific tests${colors.reset}`);
      }
    });
    testsPassed++;
  } catch (error) {
    testsFailed++;
  }

  if (courseId) {
    try {
      await test("Get course details", async () => {
        const result = await getCourseDetails({ courseId: courseId! });

        if (!result.content || result.content.length === 0) {
          throw new Error("Expected content array in response");
        }

        const content = result.content[0];
        if (content.type !== "text") {
          throw new Error("Expected text content type");
        }

        const data = JSON.parse(content.text);
        if (!data.course || typeof data.course !== "object") {
          throw new Error("Expected course object in response");
        }

        console.log(`  ${colors.dim}Course: ${data.course.name || "Unnamed"}${colors.reset}`);

        if (data.announcements) {
          console.log(`  ${colors.dim}Announcements: ${data.announcements.length}${colors.reset}`);
        }

        if (data.teachers) {
          console.log(`  ${colors.dim}Teachers: ${data.teachers.length}${colors.reset}`);
        }
      });
      testsPassed++;
    } catch (error) {
      testsFailed++;
    }

    try {
      await test("Get assignments without submissions", async () => {
        const result = await getAssignments({
          courseId: courseId!,
          includeSubmissions: false
        });

        if (!result.content || result.content.length === 0) {
          throw new Error("Expected content array in response");
        }

        const content = result.content[0];
        if (content.type !== "text") {
          throw new Error("Expected text content type");
        }

        const data = JSON.parse(content.text);
        if (!Array.isArray(data.assignments)) {
          throw new Error("Expected assignments array in response");
        }

        console.log(`  ${colors.dim}Assignments: ${data.assignments.length}${colors.reset}`);

        if (data.assignments.length > 0) {
          const hasSubmissions = data.assignments.some((a: any) => a.submissions);
          if (hasSubmissions) {
            throw new Error("Submissions should not be included when includeSubmissions is false");
          }
        }
      });
      testsPassed++;
    } catch (error) {
      testsFailed++;
    }

    try {
      await test("Get assignments with submissions", async () => {
        const result = await getAssignments({
          courseId: courseId!,
          includeSubmissions: true
        });

        if (!result.content || result.content.length === 0) {
          throw new Error("Expected content array in response");
        }

        const content = result.content[0];
        if (content.type !== "text") {
          throw new Error("Expected text content type");
        }

        const data = JSON.parse(content.text);
        if (!Array.isArray(data.assignments)) {
          throw new Error("Expected assignments array in response");
        }

        console.log(`  ${colors.dim}Assignments with submissions: ${data.assignments.length}${colors.reset}`);

        if (data.assignments.length > 0 && data.assignments[0].submissions) {
          console.log(`  ${colors.dim}First assignment has ${data.assignments[0].submissions.length} submission(s)${colors.reset}`);
        }
      });
      testsPassed++;
    } catch (error) {
      testsFailed++;
    }
    let assignmentId: string | undefined;
    let submissionId: string | undefined;

    // Test download assignment functionality
    try {
      await test("Download single assignment", async () => {
        const service = ClassroomService.getInstance();

        // First get assignments to have an ID
        const assignments = await service.getAllAssignments(courseId!);
        if (assignments.length === 0) {
          console.log(`  ${colors.yellow}No assignments to download${colors.reset}`);
          return;
        }

        assignmentId = assignments[0].id;
        if (!assignmentId) {
          throw new Error("Assignment ID is missing");
        }

        const result = await service.downloadAssignment(courseId!, assignmentId, './test-downloads');

        if (!result.assignment || typeof result.assignment !== "object") {
          throw new Error("Expected assignment object in response");
        }

        console.log(`  ${colors.dim}Downloaded assignment: ${result.assignment.title || "Untitled"}${colors.reset}`);
        console.log(`  ${colors.dim}Materials count: ${result.materials.length}${colors.reset}`);
        console.log(`  ${colors.dim}Downloaded files: ${result.downloadedFiles.length}${colors.reset}`);
      });
      testsPassed++;
    } catch (error) {
      testsFailed++;
    }

    // Test download submission functionality
    if (assignmentId) {
      try {
        await test("Download submission", async () => {
          const service = ClassroomService.getInstance();

          // Get submissions for the assignment
          const submissions = await service.getStudentSubmissions(courseId!, assignmentId!);
          if (submissions.length === 0) {
            console.log(`  ${colors.yellow}No submissions to download${colors.reset}`);
            return;
          }

          submissionId = submissions[0].id;
          if (!submissionId) {
            throw new Error("Submission ID is missing");
          }

          const result = await service.downloadSubmission(courseId!, assignmentId!, submissionId, './test-downloads');

          if (!result.submission || typeof result.submission !== "object") {
            throw new Error("Expected submission object in response");
          }

          console.log(`  ${colors.dim}Downloaded submission ID: ${result.submission.id}${colors.reset}`);
          console.log(`  ${colors.dim}State: ${result.submission.state || "Unknown"}${colors.reset}`);
          console.log(`  ${colors.dim}Attachments count: ${result.attachments.length}${colors.reset}`);
          console.log(`  ${colors.dim}Downloaded files: ${result.downloadedFiles.length}${colors.reset}`);
        });
        testsPassed++;
      } catch (error) {
        testsFailed++;
      }

      try {
        await test("Download all submissions for assignment", async () => {
          const service = ClassroomService.getInstance();

          const result = await service.downloadAllSubmissions(courseId!, assignmentId!, './test-downloads');

          if (!result.assignment || typeof result.assignment !== "object") {
            throw new Error("Expected assignment object in response");
          }

          if (!Array.isArray(result.submissions)) {
            throw new Error("Expected submissions array in response");
          }

          console.log(`  ${colors.dim}Assignment: ${result.assignment.title || "Untitled"}${colors.reset}`);
          console.log(`  ${colors.dim}Total submissions: ${result.submissions.length}${colors.reset}`);

          const totalAttachments = result.submissions.reduce(
            (sum, s) => sum + s.attachments.length,
            0
          );
          console.log(`  ${colors.dim}Total attachments: ${totalAttachments}${colors.reset}`);
          console.log(`  ${colors.dim}Total downloaded files: ${result.totalDownloadedFiles.length}${colors.reset}`);
        });
        testsPassed++;
      } catch (error) {
        testsFailed++;
      }
    }

    // Test download all course submissions
    try {
      await test("Download all course submissions", async () => {
        const service = ClassroomService.getInstance();

        const { results, allDownloadedFiles } = await service.downloadAllCourseSubmissions(courseId!, './test-downloads');

        if (!Array.isArray(results)) {
          throw new Error("Expected array of assignment-submission pairs");
        }

        console.log(`  ${colors.dim}Total assignments: ${results.length}${colors.reset}`);

        const totalSubmissions = results.reduce(
          (sum, r) => sum + r.submissions.length,
          0
        );
        console.log(`  ${colors.dim}Total submissions across all assignments: ${totalSubmissions}${colors.reset}`);

        const assignmentsWithSubmissions = results.filter(r => r.submissions.length > 0).length;
        console.log(`  ${colors.dim}Assignments with submissions: ${assignmentsWithSubmissions}${colors.reset}`);
        console.log(`  ${colors.dim}All downloaded files: ${allDownloadedFiles.length}${colors.reset}`);
      });
      testsPassed++;
    } catch (error) {
      testsFailed++;
    }
  } else {
    console.log(`\n${colors.yellow}Skipping course-specific tests (no courses available)${colors.reset}`);
  }

  // Check if any files were downloaded
  try {
    await test("Verify downloaded files", async () => {
      const downloadPath = "./test-downloads";
      try {
        const stats = await fs.stat(downloadPath);
        if (!stats.isDirectory()) {
          throw new Error("Download path is not a directory");
        }

        // List all downloaded files recursively
        const getAllFiles = async (dir: string): Promise<string[]> => {
          const files: string[] = [];
          const items = await fs.readdir(dir, { withFileTypes: true });

          for (const item of items) {
            const fullPath = path.join(dir, item.name);
            if (item.isDirectory()) {
              files.push(...await getAllFiles(fullPath));
            } else {
              files.push(fullPath);
            }
          }
          return files;
        };

        const allFiles = await getAllFiles(downloadPath);
        console.log(`  ${colors.dim}Total files in download directory: ${allFiles.length}${colors.reset}`);

        // Check for JSON metadata files
        const jsonFiles = allFiles.filter(f => f.endsWith('.json'));
        console.log(`  ${colors.dim}Metadata files (JSON): ${jsonFiles.length}${colors.reset}`);

        // Check for PDF files
        const pdfFiles = allFiles.filter(f => f.endsWith('.pdf'));
        console.log(`  ${colors.dim}PDF files: ${pdfFiles.length}${colors.reset}`);

        // Keep downloads for inspection
        console.log(`  ${colors.dim}Keeping test downloads for inspection${colors.reset}`);
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          console.log(`  ${colors.yellow}No files were downloaded (directory doesn't exist)${colors.reset}`);
        } else {
          throw error;
        }
      }
    });
    testsPassed++;
  } catch (error) {
    testsFailed++;
  }

  console.log(`\n${colors.blue}Test Summary${colors.reset}`);
  console.log(`${colors.green}Passed: ${testsPassed}${colors.reset}`);
  if (testsFailed > 0) {
    console.log(`${colors.red}Failed: ${testsFailed}${colors.reset}`);
  }
  console.log("");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch((error) => {
  console.error(`\n${colors.red}Test suite failed:${colors.reset}`, error);
  process.exit(1);
});
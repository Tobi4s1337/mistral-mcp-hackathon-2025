import { listCourses, getCourseDetails, getAssignments } from "./classroom/tools/index.js";

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
        courseId = data.courses[0].id;
        console.log(`  ${colors.dim}Found ${data.courses.length} course(s)${colors.reset}`);
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
  } else {
    console.log(`\n${colors.yellow}Skipping course-specific tests (no courses available)${colors.reset}`);
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
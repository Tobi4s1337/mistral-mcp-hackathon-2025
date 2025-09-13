import { getCourseDetails } from "./classroom/tools/index.js";

async function testCourseDetails() {
  console.log("Testing getCourseDetails with courseId: 806194193413\n");

  try {
    const result = await getCourseDetails({ courseId: "806194193413" });

    console.log("Raw result:", JSON.stringify(result, null, 2));

    if (result.content && result.content[0]) {
      const data = JSON.parse(result.content[0].text);
      console.log("\nParsed data:", JSON.stringify(data, null, 2));

      if (data.course) {
        console.log("\nCourse object keys:", Object.keys(data.course));
        console.log("Course details:", data.course);
      }

      if (data.announcements) {
        console.log("\nAnnouncements count:", data.announcements.length);
      }

      if (data.teachers) {
        console.log("\nTeachers count:", data.teachers.length);
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

testCourseDetails();
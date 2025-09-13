#!/usr/bin/env tsx

import { ClassroomService } from '../classroom/index.js';
import { optimizedWorksheetService } from '../worksheets/index.js';

async function testWorksheetAssignment() {
  console.log('🧪 Testing worksheet assignment creation...\n');

  try {
    const service = ClassroomService.getInstance();

    // Step 1: List courses
    console.log('📚 Fetching available courses...');
    const courses = await service.getAllCourses();

    if (courses.length === 0) {
      console.log('❌ No courses found. Please ensure you have access to at least one course.');
      return;
    }

    console.log(`Found ${courses.length} course(s):`);
    courses.forEach((course, index) => {
      console.log(`  ${index + 1}. ${course.name} (${course.id})`);
    });

    // Use the first course for testing
    const courseId = courses[0].id!;
    const courseName = courses[0].name!;
    console.log(`\n✅ Using course: ${courseName}\n`);

    // Step 2: Generate a test worksheet
    console.log('📝 Generating a test worksheet...');
    const worksheetPrompt = 'Create a 4th grade math worksheet on fractions with 10 questions including addition and subtraction of fractions';

    const worksheetResult = await optimizedWorksheetService.generateWorksheetWithPDF(
      worksheetPrompt,
      true // Include answer key
    );

    console.log(`✅ Worksheet generated: ${worksheetResult.title}`);
    console.log(`   PDF URL: ${worksheetResult.pdfUrl}`);
    console.log(`   Answer Key: ${worksheetResult.answerKeyPdfUrl}\n`);

    // Step 3: Create assignment with the worksheet
    console.log('📤 Creating assignment in Google Classroom...');

    const assignmentResult = await service.createAssignmentWithWorksheet({
      courseId,
      title: worksheetResult.title,
      pdfUrl: worksheetResult.pdfUrl,
      description: worksheetResult.summary,
      instructions: 'Complete all problems on the worksheet. Show your work for full credit.',
      maxPoints: worksheetResult.totalPoints || 100,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Due in 1 week
      assigneeMode: 'ALL_STUDENTS', // Assign to all students
    });

    console.log('✅ Assignment created successfully!');
    console.log(`   ${assignmentResult.message}`);
    console.log(`   Assignment ID: ${assignmentResult.assignment.id}`);
    console.log(`   Google Drive File: ${assignmentResult.driveFile.webViewLink}`);
    console.log(`   Classroom Link: ${assignmentResult.assignment.alternateLink}`);

    // Optional: Test creating assignment for specific students
    console.log('\n📤 Testing assignment for specific students...');

    // Get list of students
    const students = await service.getCourseStudents(courseId);

    if (students.length > 1) {
      // Create another worksheet
      const worksheet2 = await optimizedWorksheetService.generateWorksheetWithPDF(
        'Create a 4th grade advanced math worksheet on word problems involving fractions',
        true
      );

      // Assign to first half of students
      const halfStudents = students.slice(0, Math.ceil(students.length / 2));
      const studentIds = halfStudents.map(s => s.userId!).filter(Boolean);

      const assignment2 = await service.createAssignmentWithWorksheet({
        courseId,
        title: `${worksheet2.title} (Advanced)`,
        pdfUrl: worksheet2.pdfUrl,
        description: worksheet2.summary,
        instructions: 'This is an advanced worksheet. Take your time and show all your work.',
        maxPoints: worksheet2.totalPoints || 100,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        assigneeMode: 'INDIVIDUAL_STUDENTS',
        studentIds,
      });

      console.log('✅ Advanced assignment created!');
      console.log(`   ${assignment2.message}`);

      // Test group with exclusions
      const excludeIds = students.slice(-2).map(s => s.userId!).filter(Boolean);

      if (excludeIds.length > 0) {
        const worksheet3 = await optimizedWorksheetService.generateWorksheetWithPDF(
          'Create a 4th grade review worksheet on basic fractions',
          true
        );

        const assignment3 = await service.createAssignmentWithWorksheet({
          courseId,
          title: `${worksheet3.title} (Review)`,
          pdfUrl: worksheet3.pdfUrl,
          description: worksheet3.summary,
          maxPoints: 50,
          assigneeMode: 'GROUP_WITH_EXCLUSIONS',
          excludeStudentIds: excludeIds,
        });

        console.log('✅ Review assignment created!');
        console.log(`   ${assignment3.message}`);
      }
    }

    console.log('\n🎉 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Error during testing:', error);
    if (error instanceof Error) {
      console.error('   ', error.message);
      console.error('   Stack:', error.stack);
    }
  }
}

// Run the test
testWorksheetAssignment().catch(console.error);
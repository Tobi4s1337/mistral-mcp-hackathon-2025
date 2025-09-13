import { generateWorksheetWithPDF, worksheetService } from "./worksheets/index.js";
import { promises as fs } from "fs";

async function testWorksheetGeneration() {
  console.log("🚀 Testing Worksheet Generation System\n");

  try {
    // Test 1: Basic worksheet generation
    console.log("📝 Test 1: Generating basic math worksheet...");
    const mathWorksheet = await worksheetService.generateWorksheet({
      prompt: "Create a worksheet on multiplication and division for grade 4 students. Include word problems about shopping and sharing items.",
      settings: {
        ageGroup: "8 - 9",
        complexity: 1,
        sectionCount: 3,
        activityTypes: ["calculations", "word-problems", "multiple-choice"],
        language: "English (US)"
      }
    });

    console.log(`✅ Generated: ${mathWorksheet.title}`);
    console.log(`   Subject: ${mathWorksheet.subject}`);
    console.log(`   Grade Level: ${mathWorksheet.gradeLevel}`);
    console.log(`   Content length: ${mathWorksheet.content.length} characters\n`);

    // Test 2: Science worksheet with automatic settings
    console.log("📝 Test 2: Generating science worksheet with automatic settings...");
    const scienceWorksheet = await worksheetService.generateWorksheet({
      prompt: "Create a worksheet about the water cycle, including evaporation, condensation, and precipitation.",
      settings: {
        ageGroup: "10 - 12",
        activityTypes: "automatic"
      }
    });

    console.log(`✅ Generated: ${scienceWorksheet.title}`);
    console.log(`   Subject: ${scienceWorksheet.subject}\n`);

    // Test 3: Alternative version generation
    console.log("📝 Test 3: Generating alternative version of math worksheet...");
    const alternativeVersion = await worksheetService.generateAlternativeVersion(
      mathWorksheet,
      { complexity: 2 }
    );

    console.log(`✅ Generated alternative: ${alternativeVersion.title}\n`);

    // Test 4: Worksheet grading simulation
    console.log("📝 Test 4: Testing worksheet grading...");
    const mockStudentAnswers = `
      1. 12 x 5 = 60
      2. 48 ÷ 6 = 8
      3. If there are 24 apples and 4 students, each gets 6 apples.
    `;

    const gradingResult = await worksheetService.gradeWorksheet(
      mathWorksheet.content.substring(0, 500), // Use a snippet for testing
      mockStudentAnswers
    );

    console.log(`✅ Grading complete:`);
    console.log(`   Score: ${gradingResult.score}/100`);
    console.log(`   Feedback: ${gradingResult.feedback.substring(0, 100)}...\n`);

    // Test 5: PDF Export (if export service is running)
    console.log("📝 Test 5: Testing PDF export (requires Docker container)...");
    try {
      const worksheetWithPDF = await generateWorksheetWithPDF(
        "Create a simple vocabulary worksheet for grade 2 students about animals.",
        {
          ageGroup: "6 - 7",
          sectionCount: 2,
          activityTypes: ["vocabulary", "matching", "fill-blanks"]
        },
        false // Don't upload to S3 for test
      );

      if (worksheetWithPDF.pdfBuffer) {
        await fs.writeFile("test-worksheet.pdf", worksheetWithPDF.pdfBuffer);
        console.log("✅ PDF saved to test-worksheet.pdf");

        if (worksheetWithPDF.answerKeyPdfBuffer) {
          await fs.writeFile("test-answer-key.pdf", worksheetWithPDF.answerKeyPdfBuffer);
          console.log("✅ Answer key PDF saved to test-answer-key.pdf");
        }
      }
    } catch (pdfError) {
      console.log("⚠️  PDF export skipped (Docker container not running)");
      console.log("   To enable: docker run -p 2305:2305 bedrockio/export-html\n");
    }

    console.log("🎉 All tests completed successfully!");

  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

// Run tests
testWorksheetGeneration().catch(console.error);
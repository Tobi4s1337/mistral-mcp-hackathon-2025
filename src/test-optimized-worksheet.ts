import { optimizedWorksheetService } from "./worksheets/optimized-service.js";
import * as fs from "fs/promises";
import * as path from "path";

async function testOptimizedWorksheetGeneration() {
  console.log("Testing optimized worksheet generation with PDF...\n");

  const testPrompts = [
    "Create a 3rd grade math worksheet on multiplication tables (2-5), with 20 practice problems",
    "Generate a high school biology worksheet about photosynthesis with diagrams and short answer questions",
    "Make a kindergarten worksheet for learning letters A-E with tracing and matching activities"
  ];

  for (const prompt of testPrompts) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Generating worksheet for: "${prompt}"`);
    console.time("Generation time");

    try {
      // Test basic generation first
      const worksheet = await optimizedWorksheetService.generateWorksheet(prompt);
      console.log(`✅ HTML Generated: ${worksheet.html.length} characters`);
      console.log(`   Title: ${worksheet.title}`);
      console.log(`   Subject: ${worksheet.subject}`);
      console.log(`   Grade: ${worksheet.grade}`);
      console.log(`   Summary: ${worksheet.summary}`);

      // Save HTML locally
      const filename = `test-worksheet-${Date.now()}.html`;
      const filepath = path.join(process.cwd(), filename);
      await fs.writeFile(filepath, worksheet.html);
      console.log(`   HTML saved to: ${filename}`);

      // Now test PDF generation with S3 upload
      console.log("\nGenerating PDF with S3 upload...");
      const pdfResult = await optimizedWorksheetService.generateWorksheetWithPDF(prompt, true);
      console.timeEnd("Generation time");

      console.log(`\n📄 PDF Generation Results:`);
      console.log(`   Worksheet PDF URL: ${pdfResult.pdfUrl}`);
      if (pdfResult.answerKeyPdfUrl) {
        console.log(`   Answer Key PDF URL: ${pdfResult.answerKeyPdfUrl}`);
      }

    } catch (error) {
      console.timeEnd("Generation time");
      console.error(`\n❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);

      if (error instanceof Error && error.message.includes('S3')) {
        console.log("\n⚠️  Note: Make sure AWS credentials and S3_BUCKET_NAME are configured in .env");
      }
      if (error instanceof Error && error.message.includes('PDF export service')) {
        console.log("\n⚠️  Note: Make sure the PDF export service is running:");
        console.log("   docker run -p 2305:2305 bedrockio/export-html");
      }
    }
  }
}

// Run the test
testOptimizedWorksheetGeneration().catch(console.error);
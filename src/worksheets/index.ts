export * from "./types.js";
export * from "./service.js";
export * from "./pdf.js";

import { worksheetService } from "./service.js";
import { pdfExportService } from "./pdf.js";
import type { WorksheetGenerationRequest, WorksheetSettings } from "./types.js";

export async function generateWorksheetWithPDF(
  prompt: string,
  settings?: Partial<WorksheetSettings>,
  uploadToS3 = false
) {
  const request: WorksheetGenerationRequest = {
    prompt,
    settings
  };

  const worksheet = await worksheetService.generateWorksheet(request);

  const pdfResult = await pdfExportService.saveWorksheetAsPDF(
    worksheet.content,
    worksheet.title,
    { format: "Letter" },
    uploadToS3,
    {
      subject: worksheet.subject,
      gradeLevel: worksheet.gradeLevel,
      language: worksheet.meta.settings.language
    }
  );

  let answerKeyPdf;
  if (worksheet.answerKey) {
    answerKeyPdf = await pdfExportService.exportAnswerKeyToPDF(
      worksheet.answerKey,
      worksheet.title
    );

    if (uploadToS3) {
      const answerKeyUrl = await pdfExportService.uploadToS3(
        answerKeyPdf.pdfBuffer,
        `answer_key_${answerKeyPdf.fileName}`,
        {
          type: "answer_key",
          originalTitle: worksheet.title
        }
      );
      answerKeyPdf = { ...answerKeyPdf, s3Url: answerKeyUrl };
    }
  }

  return {
    ...worksheet,
    pdfUrl: pdfResult.s3Url,
    pdfBuffer: pdfResult.pdfBuffer,
    answerKeyPdfBuffer: answerKeyPdf?.pdfBuffer,
    answerKeyPdfUrl: answerKeyPdf?.s3Url
  };
}

export { worksheetService, pdfExportService };
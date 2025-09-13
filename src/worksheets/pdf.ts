import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

export interface PDFExportOptions {
  format?: "Letter" | "A4" | "Legal";
  landscape?: boolean;
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
}

export interface PDFExportResult {
  pdfBuffer: Buffer;
  fileName: string;
  s3Url?: string;
}

export class PDFExportService {
  private s3Client: S3Client | null = null;
  private bucketName: string;
  private exportServiceUrl: string;

  constructor() {
    this.exportServiceUrl = process.env.PDF_EXPORT_SERVICE_URL || "http://localhost:2305";
    this.bucketName = process.env.S3_BUCKET_NAME || "";

    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      this.s3Client = new S3Client({
        region: process.env.AWS_REGION || "us-east-1",
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      });
    }
  }

  private wrapHTMLContent(html: string, title: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        @page {
            size: Letter;
            margin: 0.75in;
        }

        @media print {
            body {
                margin: 0;
            }
            .page-break {
                page-break-after: always;
            }
        }

        body {
            font-family: 'Times New Roman', Times, serif;
            font-size: 12pt;
            line-height: 1.5;
            color: #000;
            background: white;
            margin: 0;
            padding: 20px;
        }

        h1 {
            font-size: 18pt;
            text-align: center;
            margin-bottom: 20px;
            font-weight: bold;
        }

        h2 {
            font-size: 14pt;
            margin-top: 15px;
            margin-bottom: 10px;
            padding-bottom: 3px;
            border-bottom: 1px solid #333;
            font-weight: bold;
        }

        h3 {
            font-size: 13pt;
            margin-top: 12px;
            margin-bottom: 8px;
            font-weight: bold;
        }

        p {
            margin: 8px 0;
        }

        strong {
            font-weight: bold;
        }

        .instructions {
            border: 1px solid #666;
            background: #f9f9f9;
            padding: 8px 12px;
            margin: 10px 0;
            font-size: 11pt;
        }

        .word-bank {
            border: 1px solid #333;
            background: #f9f9f9;
            padding: 8px 12px;
            margin: 10px 0;
        }

        .answer-line {
            border-bottom: 1px solid #666;
            min-height: 20px;
            line-height: 20px;
            margin: 4px 0;
        }

        .work-area {
            border: 1px solid #999;
            min-height: 80px;
            padding: 10px;
            margin: 8px 0 8px 20px;
        }

        table {
            border-collapse: collapse;
            width: 100%;
            margin: 10px 0;
        }

        th, td {
            border: 1px solid #333;
            padding: 6px 8px;
            text-align: left;
        }

        th {
            background: #f0f0f0;
            font-weight: bold;
        }

        .question {
            margin-bottom: 12px;
        }

        .question-number {
            font-weight: bold;
            display: inline-block;
            min-width: 25px;
        }

        .choices {
            padding-left: 25px;
            margin-top: 4px;
        }

        .choice {
            margin: 3px 0;
        }

        @media print {
            .no-print {
                display: none;
            }
        }
    </style>
</head>
<body>
    <h1>${title}</h1>
    ${html}
</body>
</html>`;
  }

  async exportToPDF(
    html: string,
    title: string,
    options: PDFExportOptions = {}
  ): Promise<PDFExportResult> {
    const wrappedHTML = this.wrapHTMLContent(html, title);

    const exportOptions = {
      format: options.format || "Letter",
      landscape: options.landscape || false,
      margin: options.margin || {
        top: "0.75in",
        right: "0.75in",
        bottom: "0.75in",
        left: "0.75in"
      },
      printBackground: true,
      preferCSSPageSize: false
    };

    try {
      const response = await axios.post(
        `${this.exportServiceUrl}/1/pdf`,
        {
          html: wrappedHTML,
          export: exportOptions
        },
        {
          headers: {
            "Content-Type": "application/json"
          },
          responseType: "arraybuffer",
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 30000
        }
      );

      const pdfBuffer = Buffer.from(response.data);
      const fileName = `worksheet_${uuidv4()}.pdf`;

      return {
        pdfBuffer,
        fileName
      };
    } catch (error) {
      console.error("PDF export error:", error);
      if (axios.isAxiosError(error)) {
        if (error.code === "ECONNREFUSED") {
          throw new Error("PDF export service is not running. Please start the Docker container: docker run -p 2305:2305 bedrockio/export-html");
        }
        throw new Error(`PDF export failed: ${error.message}`);
      }
      throw new Error("Failed to export PDF");
    }
  }

  async uploadToS3(
    pdfBuffer: Buffer,
    fileName: string,
    metadata?: Record<string, string>
  ): Promise<string> {
    if (!this.s3Client || !this.bucketName) {
      throw new Error("S3 is not configured. Please set AWS credentials and S3_BUCKET_NAME");
    }

    const key = `worksheets/${new Date().toISOString().split("T")[0]}/${fileName}`;

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: pdfBuffer,
        ContentType: "application/pdf",
        Metadata: metadata
      });

      await this.s3Client.send(command);

      return `https://${this.bucketName}.s3.amazonaws.com/${key}`;
    } catch (error) {
      console.error("S3 upload error:", error);
      throw new Error(`Failed to upload to S3: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async saveWorksheetAsPDF(
    worksheetHTML: string,
    title: string,
    options: PDFExportOptions = {},
    uploadToS3 = false,
    metadata?: Record<string, string>
  ): Promise<PDFExportResult> {
    const pdfResult = await this.exportToPDF(worksheetHTML, title, options);

    if (uploadToS3) {
      const s3Url = await this.uploadToS3(pdfResult.pdfBuffer, pdfResult.fileName, metadata);
      return {
        ...pdfResult,
        s3Url
      };
    }

    return pdfResult;
  }

  async exportAnswerKeyToPDF(
    answerKeyHTML: string,
    originalTitle: string,
    options: PDFExportOptions = {}
  ): Promise<PDFExportResult> {
    const title = `Answer Key - ${originalTitle}`;
    const wrappedHTML = `
      <div style="background: #f0f0f0; padding: 10px; margin-bottom: 20px; border: 2px solid #333;">
        <p style="font-weight: bold; margin: 0; text-align: center;">ANSWER KEY</p>
      </div>
      ${answerKeyHTML}
    `;

    return this.exportToPDF(wrappedHTML, title, options);
  }

  async generateCombinedPDF(
    worksheetHTML: string,
    answerKeyHTML: string,
    title: string,
    options: PDFExportOptions = {}
  ): Promise<PDFExportResult> {
    const combinedHTML = `
      ${worksheetHTML}
      <div class="page-break"></div>
      <div style="background: #f0f0f0; padding: 10px; margin-bottom: 20px; border: 2px solid #333;">
        <p style="font-weight: bold; margin: 0; text-align: center;">ANSWER KEY</p>
      </div>
      ${answerKeyHTML}
    `;

    return this.exportToPDF(combinedHTML, title, options);
  }
}

export const pdfExportService = new PDFExportService();
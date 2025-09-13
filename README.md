# EduAdapt MCP Server

<p align="center">
  <img src="src/worksheets/eduadaptlogo.png" alt="EduAdapt Logo" width="200"/>
</p>

Intelligent classroom management system with Google Classroom integration, AI-powered worksheet generation, automated grading, and image generation capabilities.

## Overview

EduAdapt is a comprehensive MCP (Model Context Protocol) server that combines Google Classroom API integration with advanced AI capabilities for personalized education. It leverages Mistral AI for content generation and grading, Bria AI for image creation, and provides seamless classroom management tools.

## Features

- **Google Classroom Integration**: Complete classroom management with courses, assignments, announcements, and grading
- **AI Worksheet Generation**: Create age-appropriate worksheets with 11+ activity types and automatic answer keys
- **Automated Grading**: AI-powered OCR and evaluation of student submissions with personalized feedback
- **Image Generation**: Create educational and motivational images using Bria AI
- **PDF Export**: Professional formatting with S3 cloud storage
- **Batch Operations**: Grade all submissions in parallel for efficiency
- **Private Feedback**: Send personalized feedback directly to individual students

## Prerequisites

- Node.js 22+
- Docker (for PDF generation service)
- Mistral API key (required for worksheet generation and grading)
- Google Cloud OAuth credentials (optional, for Classroom integration)
- AWS credentials (optional, for S3 storage)
- Bria AI API key (optional, for image generation)

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env and add your API keys

# Run PDF export service (required for worksheet PDF generation)
docker run -p 2305:2305 bedrockio/export-html

# For Google Classroom integration (optional)
# 1. Add OAuth credentials to credentials.json or credentials.example.json
# 2. Authenticate
npm run auth

# Start development server
npm run dev
```

## Setup Guide

### Google Classroom Setup (Optional)

1. **Create OAuth Credentials**:
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a new project or select existing
   - Enable Google Classroom API
   - Create OAuth 2.0 credentials
   - Add authorized redirect URIs: `http://localhost:3000/oauth2callback`
   - Download credentials as JSON

2. **Configure Authentication**:
   ```bash
   # Copy credentials to project
   cp /path/to/downloaded/credentials.json ./credentials.json
   
   # Run authentication
   npm run auth
   # This opens a browser for Google login and saves tokens to tokens.json
   ```

### AWS S3 Setup (Optional)

For cloud storage of generated PDFs:

1. Create an S3 bucket
2. Configure IAM user with S3 access
3. Add credentials to `.env`:
   ```env
   AWS_ACCESS_KEY_ID=your_key
   AWS_SECRET_ACCESS_KEY=your_secret
   AWS_REGION=us-east-1
   S3_BUCKET_NAME=your-bucket
   ```

## Testing

```bash
# MCP Inspector - Interactive tool testing
npm run inspector
# Open http://localhost:3000/mcp in browser

# Test worksheet generation
npm run test:worksheet

# Test Google Classroom integration
npm run test:classroom

# List assignments (for testing)
npm run list:assignments
```

## Architecture

```
src/
├── classroom/          # Google Classroom integration
│   ├── auth/          # OAuth authentication
│   ├── api/           # API client wrapper
│   ├── services/      # Business logic
│   └── tools/         # MCP tool implementations
├── worksheets/        # Worksheet generation system
│   ├── service.ts     # Core generation logic
│   ├── pdf.ts         # PDF export & S3 upload
│   └── types.ts       # TypeScript definitions
├── llm/               # Mistral AI integration
│   └── mistral.ts     # API client wrapper
└── server.ts          # MCP server configuration
```

## MCP Tools Available

### Google Classroom Tools

- **`google-classroom-courses`** - List all courses for the authenticated user
  - Returns: Course IDs, names, sections, enrollment info
  
- **`google-classroom-course-details`** - Get detailed course information
  - Required: `courseId` (from courses tool)
  - Returns: Course details, teachers, recent announcements
  
- **`google-classroom-assignments`** - Get assignments/coursework
  - Required: `courseId`
  - Optional: `includeSubmissions` (default: true)
  - Returns: Assignment list with titles, due dates, submission status
  
- **`google-classroom-comprehensive-data`** - Get ALL classroom data in one call
  - Optional: `includeAnnouncements`, `includeSubmissions`, `maxAssignmentsPerCourse`, `maxAnnouncementsPerCourse`
  - Returns: Complete data for all courses including students, teachers, assignments, submissions, and announcements
  
- **`google-classroom-nudge-students`** - Send reminders for pending assignments
  - Required: `courseId`
  - Automatically identifies students with incomplete work
  
- **`google-classroom-create-announcement`** - Create announcements with optional AI images
  - Required: `courseId`, `text`
  - Optional: `imagePrompt` (generates image via Bria AI), `assigneeMode`, `studentIds`, `materials`
  - Supports targeting all students or specific individuals
  
- **`google-classroom-create-worksheet-assignment`** - Create assignments with PDF worksheets
  - Required: `courseId`, `worksheetPdfUrl`, `title`
  - Optional: `description`, `instructions`, `maxPoints`, assignment targeting options
  - Automatically uploads PDFs to Google Drive
  
- **`google-classroom-grade-all-submissions`** - Batch grade PDF submissions with AI
  - Required: `courseId`, `assignmentId`
  - Uses Mistral AI for OCR and evaluation
  - Provides detailed feedback and learning recommendations
  
- **`google-classroom-set-grade-feedback`** - Set grades and send private feedback
  - Required: `courseId`, `assignmentId`, `studentId`, `grade`
  - Optional: `feedback`, `isDraft`
  - Sends personalized feedback as private announcements

### Content Generation Tools

- **`generate-worksheet`** - Create comprehensive educational worksheets
  - Required: `prompt` (describe subject, topic, grade level)
  - Optional: `includeAnswerKey` (default: true)
  - Returns: PDF URLs for worksheet and answer key with grading rubric
  - Features: 15-25 questions, varied activity types, age-appropriate content
  
- **`generate-image`** - Generate educational images with Bria AI
  - Required: `prompt`
  - Optional: `aspectRatio`, `style` (photography/art), `isMotivational`
  - Returns: Image URL for use in materials or announcements

## Environment Variables

Create a `.env` file from `.env.example`:

```env
# Server Configuration
MCP_HTTP_PORT=3000                        # MCP server port

# Mistral AI Configuration (REQUIRED)
MISTRAL_API_KEY=your_mistral_api_key     # For worksheet generation and grading

# PDF Export Service (REQUIRED for worksheets)
PDF_EXPORT_SERVICE_URL=http://localhost:2305  # Docker service URL

# AWS S3 Configuration (Optional - for cloud PDF storage)
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_REGION=us-east-1
S3_BUCKET_NAME=your-bucket-name

# Bria AI Configuration (Optional - for image generation)
BRIA_API_KEY=your_bria_api_key

# Google Classroom (Optional - can use files or env vars)
# Option 1: Use credentials.json and tokens.json files (recommended)
# Option 2: Set as environment variables:
GOOGLE_CREDENTIALS={"web":{...}}  # Full JSON from credentials.json
GOOGLE_TOKENS={"access_token":...}  # Full JSON from tokens.json
```

## Services Used

### Core Services

- **Mistral AI**: Powers worksheet generation, content creation, and automated grading
  - Models: mistral-tiny, mistral-small, mistral-medium-latest, mistral-large
  - Features: Structured output, JSON parsing, streaming support
  
- **Google Classroom API**: Complete classroom management integration
  - OAuth 2.0 authentication
  - Courses, assignments, announcements, grading
  - Student and teacher management
  
- **Bria AI**: Educational image generation
  - Multiple styles and aspect ratios
  - Motivational content generation
  - Content moderation for safety

### Infrastructure Services

- **PDF Export Service**: HTML to PDF conversion
  - Docker container: `bedrockio/export-html`
  - Required for worksheet PDF generation
  
- **AWS S3**: Cloud storage for generated PDFs
  - Optional but recommended for production
  - Enables easy sharing and distribution

## Development

```bash
# Development server with hot-reload
npm run dev

# Build TypeScript
npm run build

# Production server
npm run start

# Linting
npx eslint src
```

## Resources

- [Mistral AI Documentation](https://docs.mistral.ai/)
- [Google Classroom API](https://developers.google.com/classroom)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Bria AI Documentation](https://docs.bria.ai/)
- [MCP Inspector](http://localhost:3000/mcp) - Interactive testing tool

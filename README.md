# EduAdapt MCP Server

Intelligent classroom management system with Google Classroom integration and AI-powered worksheet generation using Mistral AI.

## Overview

EduAdapt is an MCP server that combines Google Classroom API integration with advanced AI capabilities for personalized education. It generates adaptive worksheets, manages classroom resources, and provides automated grading through Mistral AI.

## Features

- **Google Classroom Integration**: List courses, view assignments, manage announcements
- **AI Worksheet Generation**: Create age-appropriate worksheets with 11+ activity types
- **PDF Export**: Professional formatting with answer keys
- **Adaptive Content**: Automatic complexity adjustment based on grade level
- **AI Grading**: Automated worksheet evaluation with detailed feedback

## Prerequisites

- Node.js 22+
- Docker (for PDF generation)
- Mistral API key
- Google Cloud OAuth credentials (for Classroom)

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Add your MISTRAL_API_KEY to .env

# Run PDF export service
docker run -p 2305:2305 bedrockio/export-html

# Start development server
npm run dev
```

## Google Classroom Setup

```bash
# 1. Add OAuth credentials to credentials.json
# 2. Authenticate
npm run auth
# 3. Test integration
npm run test
```

## Testing

```bash
# Test Google Classroom integration
npm run test

# Test worksheet generation
npm run test:worksheet

# MCP Inspector
npm run inspector
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

- `google-classroom-courses` - List all courses
- `google-classroom-course-details` - Get course details with announcements
- `google-classroom-assignments` - Get assignments with submissions

## Environment Variables

```env
MCP_HTTP_PORT=3000
MISTRAL_API_KEY=your_key
PDF_EXPORT_SERVICE_URL=http://localhost:2305
AWS_ACCESS_KEY_ID=optional
AWS_SECRET_ACCESS_KEY=optional
S3_BUCKET_NAME=optional
```

## Resources

- [Mistral AI Documentation](https://docs.mistral.ai/)
- [Google Classroom API](https://developers.google.com/classroom)
- [Model Context Protocol](https://modelcontextprotocol.io/)

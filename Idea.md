# EduAdapt MCP Server
**Mistral Hackathon 2025 Project**

## Overview
An MCP server for intelligent classroom management via Google Classroom integration, featuring personalized learning through adaptive worksheet generation.

## Core Features

### 1. Google Classroom Integration
- Manage classrooms and track student progress
- Automate assignment distribution and collection
- Real-time progress monitoring

### 2. Personalized Learning System
- **Memory Storage**: Qdrant vector database for student profiles
  - Learning challenges (language barriers, topic difficulties)
  - Performance history and patterns
  - Individual learning preferences

- **Adaptive Content Generation**:
  - Scaffolded worksheets for struggling students
  - Accelerated content for advanced learners
  - Topic-specific remediation materials

### 3. Automated Assessment
- MistralOCR integration for worksheet grading
- Automated feedback generation
- Progress tracking and analytics

## Technical Stack
- **Base**: Alpic MCP Template (TypeScript, HTTP transport)
- **APIs**: Google Classroom API
- **Vector DB**: Qdrant for student memory storage
- **AI Services**:
  - Mistral for content generation
  - MistralOCR for document processing

## Architecture Flow
1. **Input**: Teacher requests via MCP client
2. **Processing**: Student profile analysis, Content adaptation
3. **Output**: Personalized assignments distributed via Google Classroom
4. **Feedback**: OCR-based grading, Update student profiles

## Key Benefits
- Reduced teacher workload through automation
- Improved student outcomes via personalization
- Data-driven insights for educational interventions
/**
 * Create announcement tool with optional image generation
 */

import { ClassroomService } from '../services/classroomService.js';
import { getBriaClient } from '../../bria/service.js';
import { config } from '../../config.js';
import type { classroom_v1 } from 'googleapis';
import axios from 'axios';
import { Readable } from 'stream';

interface CreateAnnouncementArgs {
  courseId: string;
  text: string;
  imagePrompt?: string;
  imageAspectRatio?: '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9';
  imageStyle?: 'photography' | 'art';
  assigneeMode?: 'ALL_STUDENTS' | 'INDIVIDUAL_STUDENTS';
  studentIds?: string[];
  materials?: Array<{
    type: 'link' | 'driveFile' | 'youtubeVideo';
    url?: string;
    driveFileId?: string;
    title?: string;
  }>;
}

/**
 * Upload an image URL to Google Drive
 */
async function uploadImageToDrive(
  imageUrl: string,
  fileName: string,
  classroomService: ClassroomService
): Promise<string> {
  try {
    // Download the image
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer'
    });
    
    const imageBuffer = Buffer.from(response.data);
    
    // Get the drive client
    const drive = await classroomService.client.getDriveClient();
    
    // Create a readable stream from the buffer
    const stream = Readable.from(imageBuffer);
    
    // Create file metadata
    const fileMetadata = {
      name: fileName,
      mimeType: 'image/png'
    };
    
    // Upload to Drive
    const driveResponse = await drive.files.create({
      requestBody: fileMetadata,
      media: {
        mimeType: 'image/png',
        body: stream
      },
      fields: 'id,name,webViewLink,webContentLink'
    });
    
    if (!driveResponse.data.id) {
      throw new Error('Failed to upload image to Drive');
    }
    
    // Make the file accessible
    await drive.permissions.create({
      fileId: driveResponse.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      }
    });
    
    return driveResponse.data.id;
  } catch (error) {
    console.error('Failed to upload image to Drive:', error);
    throw error;
  }
}

export async function createAnnouncement(args: CreateAnnouncementArgs) {
  try {
    const classroomService = ClassroomService.getInstance();
    
    // Prepare materials array
    const materials: classroom_v1.Schema$Material[] = [];
    
    // Add any provided materials
    if (args.materials) {
      for (const material of args.materials) {
        if (material.type === 'link' && material.url) {
          materials.push({
            link: {
              url: material.url,
              title: material.title
            }
          });
        } else if (material.type === 'driveFile' && material.driveFileId) {
          materials.push({
            driveFile: {
              driveFile: {
                id: material.driveFileId,
                title: material.title
              },
              shareMode: 'VIEW'
            }
          });
        } else if (material.type === 'youtubeVideo' && material.url) {
          materials.push({
            youtubeVideo: {
              id: material.url,
              title: material.title
            }
          });
        }
      }
    }
    
    // Generate image if requested
    let generatedImageUrl: string | undefined;
    let imageDriveFileId: string | undefined;
    
    if (args.imagePrompt && config.BRIA_API_KEY) {
      console.log('Generating image with Bria AI...');
      const briaClient = getBriaClient();
      
      // Generate the image
      generatedImageUrl = await briaClient.generateSingleImage(
        args.imagePrompt,
        args.imageAspectRatio || '16:9'
      );
      
      console.log('Image generated successfully:', generatedImageUrl);
      
      // Upload to Google Drive for better integration
      console.log('Uploading image to Google Drive...');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `announcement-image-${timestamp}.png`;
      
      imageDriveFileId = await uploadImageToDrive(
        generatedImageUrl,
        fileName,
        classroomService
      );
      
      console.log('Image uploaded to Drive:', imageDriveFileId);
      
      // Add the image as a material
      materials.push({
        driveFile: {
          driveFile: {
            id: imageDriveFileId,
            title: `Generated Image: ${args.imagePrompt.substring(0, 50)}...`
          },
          shareMode: 'VIEW'
        }
      });
    }
    
    // Prepare the announcement request body
    const announcementBody: classroom_v1.Schema$Announcement = {
      text: args.text,
      materials: materials.length > 0 ? materials : undefined,
      state: 'PUBLISHED',
      assigneeMode: args.assigneeMode || 'ALL_STUDENTS'
    };
    
    // Add individual students options if specified
    if (args.assigneeMode === 'INDIVIDUAL_STUDENTS' && args.studentIds) {
      announcementBody.individualStudentsOptions = {
        studentIds: args.studentIds
      };
    }
    
    // Create the announcement with proper assignee mode
    const announcement = await classroomService.client.createAnnouncement(
      args.courseId,
      announcementBody.text!,
      announcementBody.materials,
      args.assigneeMode || 'ALL_STUDENTS',
      args.studentIds
    );
    
    // Get course details for context
    const course = await classroomService.getCourseWithDetails(args.courseId);
    
    // Prepare response
    let responseText = `✅ **Announcement Created Successfully!**\n\n`;
    responseText += `**Course:** ${course.name}\n`;
    responseText += `**Announcement ID:** ${announcement.id}\n`;
    responseText += `**Status:** Published\n\n`;
    responseText += `**Message:** ${args.text}\n\n`;
    
    if (args.assigneeMode === 'INDIVIDUAL_STUDENTS' && args.studentIds) {
      responseText += `**Recipients:** ${args.studentIds.length} specific student(s)\n`;
    } else {
      responseText += `**Recipients:** All students in the course\n`;
    }
    
    if (generatedImageUrl) {
      responseText += `\n**Generated Image:**\n`;
      responseText += `• Prompt: "${args.imagePrompt}"\n`;
      responseText += `• Image URL: ${generatedImageUrl}\n`;
      responseText += `• Drive File ID: ${imageDriveFileId}\n`;
      responseText += `• The image has been attached to the announcement\n`;
    }
    
    if (materials.length > 0) {
      responseText += `\n**Attached Materials:** ${materials.length} item(s)\n`;
    }
    
    if (announcement.alternateLink) {
      responseText += `\n**View in Classroom:** ${announcement.alternateLink}`;
    }
    
    return {
      content: [{
        type: "text",
        text: responseText
      }]
    };
    
  } catch (error) {
    console.error('Failed to create announcement:', error);
    
    return {
      content: [{
        type: "text",
        text: `Failed to create announcement: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease check that:\n1. The courseId is valid\n2. You have permission to create announcements\n3. The Bria API key is configured (if using image generation)\n4. Student IDs are valid (if targeting specific students)`
      }],
      isError: true
    };
  }
}
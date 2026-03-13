/**
 * generate_video — Generate videos from text or images using AI.
 *
 * Supports text-to-video and image-to-video modes.
 * Uses async task pattern (submit -> poll -> download).
 * Global tool.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import type { ToolContext } from '../core/tool-context';
import { getVideoService } from '../services/video-service';

const schema = z.object({
  prompt: z.string().describe('Video description (what the video should show)'),
  filename: z.string().optional().describe('Output filename'),
  image: z.string().optional().describe('First frame image path for image-to-video mode'),
  aspect_ratio: z.enum(['16:9', '9:16', '1:1']).default('16:9')
    .describe('Video aspect ratio (default: 16:9)'),
  duration: z.enum(['5', '10']).default('5')
    .describe('Video duration in seconds: 5 or 10'),
});

type Input = z.infer<typeof schema>;

export class GenerateVideoTool extends BaseTool<Input, string> {
  name = 'generate_video';
  description = 'Generate a video from a text description or an initial frame image. Produces MP4 video. This is an async operation that may take several minutes. Configure via VIDEO_API_URL and VIDEO_API_KEY environment variables.';
  schema = schema;
  safety = { timeout: 600_000, retryCount: 0, maxResultSize: 25_000 }; // 10 minute timeout

  protected async _run(input: Input, ctx?: ToolContext): Promise<string> {
    const service = getVideoService();

    if (!service.isConfigured()) {
      return 'Video generation not configured. Set VIDEO_API_URL and VIDEO_API_KEY environment variables.';
    }

    try {
      ctx?.reportProgress?.('Submitting video generation request...');

      const outputDir = ctx?.workspacePath
        ? `${ctx.workspacePath}/files`
        : undefined;

      const result = await service.generateVideo(input.prompt, {
        filename: input.filename,
        image: input.image,
        aspectRatio: input.aspect_ratio,
        duration: input.duration,
        outputDir,
      });

      return `Video generated successfully.\nPath: ${result.path}${result.url ? `\nURL: ${result.url}` : ''}`;
    } catch (err: any) {
      return `Video generation failed: ${err.message}`;
    }
  }
}

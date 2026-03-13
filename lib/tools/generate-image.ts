/**
 * generate_image — Generate images using an external API.
 *
 * Supports OpenAI DALL-E compatible API protocol.
 * Configured via IMAGE_API_URL and IMAGE_API_KEY env vars.
 * Global tool.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import type { ToolContext } from '../core/tool-context';
import { getImageService } from '../services/image-service';

const schema = z.object({
  prompt: z.string().describe('Detailed description of the image to generate'),
  filename: z.string().optional().describe('Output filename (default: auto-generated)'),
  aspect_ratio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4', '21:9']).default('1:1')
    .describe('Image aspect ratio (default: 1:1)'),
  quality: z.enum(['standard', 'hd']).default('standard')
    .describe('Image quality: standard or hd'),
  seed: z.number().optional().describe('Random seed for reproducible generation'),
});

type Input = z.infer<typeof schema>;

export class GenerateImageTool extends BaseTool<Input, string> {
  name = 'generate_image';
  description = 'Generate an image from a text description. Produces high-quality images using AI. Configure via IMAGE_API_URL and IMAGE_API_KEY environment variables.';
  schema = schema;
  safety = { timeout: 120_000, retryCount: 0, maxResultSize: 25_000 };

  protected async _run(input: Input, ctx?: ToolContext): Promise<string> {
    const service = getImageService();

    if (!service.isConfigured()) {
      return 'Image generation not configured. Set IMAGE_API_URL and IMAGE_API_KEY environment variables.';
    }

    try {
      const outputDir = ctx?.workspacePath
        ? `${ctx.workspacePath}/files`
        : undefined;

      const result = await service.generateImage(input.prompt, {
        filename: input.filename,
        aspectRatio: input.aspect_ratio,
        quality: input.quality,
        seed: input.seed,
        outputDir,
      });

      return `Image generated successfully.\nPath: ${result.path}${result.url ? `\nURL: ${result.url}` : ''}`;
    } catch (err: any) {
      return `Image generation failed: ${err.message}`;
    }
  }
}

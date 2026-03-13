/**
 * edit_image — Edit existing images using AI.
 *
 * Applies AI-powered edits based on text instructions.
 * Compresses large source images automatically via sharp.
 * Global tool.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import type { ToolContext } from '../core/tool-context';
import { getImageService } from '../services/image-service';

const schema = z.object({
  prompt: z.string().describe('Editing instruction (e.g., "Remove the background", "Add a sunset sky")'),
  images: z.union([z.string(), z.array(z.string())])
    .describe('Source image path(s) to edit'),
  filename: z.string().optional().describe('Output filename'),
  aspect_ratio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4', '21:9']).optional()
    .describe('Output aspect ratio (default: same as source)'),
  quality: z.enum(['standard', 'hd']).default('standard')
    .describe('Output quality: standard or hd'),
  strength: z.number().min(0).max(1).default(0.5)
    .describe('Edit strength: 0 (subtle) to 1 (dramatic). Default: 0.5'),
  seed: z.number().optional().describe('Random seed for reproducible editing'),
});

type Input = z.infer<typeof schema>;

export class EditImageTool extends BaseTool<Input, string> {
  name = 'edit_image';
  description = 'Edit an existing image using AI. Provide the source image(s) and a text instruction describing the desired edit. Large images are automatically compressed. Configure via IMAGE_API_URL and IMAGE_API_KEY environment variables.';
  schema = schema;
  safety = { timeout: 120_000, retryCount: 0, maxResultSize: 25_000 };

  protected async _run(input: Input, ctx?: ToolContext): Promise<string> {
    const service = getImageService();

    if (!service.isConfigured()) {
      return 'Image editing not configured. Set IMAGE_API_URL and IMAGE_API_KEY environment variables.';
    }

    const imagePaths = Array.isArray(input.images) ? input.images : [input.images];

    if (imagePaths.length === 0) {
      return 'Error: No source images provided.';
    }

    if (imagePaths.length > 10) {
      return 'Error: Maximum 10 source images per edit.';
    }

    try {
      const outputDir = ctx?.workspacePath
        ? `${ctx.workspacePath}/files`
        : undefined;

      const result = await service.editImage(input.prompt, imagePaths, {
        filename: input.filename,
        aspectRatio: input.aspect_ratio,
        quality: input.quality,
        strength: input.strength,
        seed: input.seed,
        outputDir,
      });

      return `Image edited successfully.\nPath: ${result.path}${result.url ? `\nURL: ${result.url}` : ''}`;
    } catch (err: any) {
      return `Image editing failed: ${err.message}`;
    }
  }
}

/**
 * analyze_image — Analyze images using LLM vision capabilities.
 *
 * Supports local files and URLs. Can analyze multiple images at once.
 * Uses OpenAI/Claude multimodal vision messages via ToolContext.callLlm().
 * Global tool.
 */

import { z } from 'zod';
import path from 'path';
import { BaseTool } from '../core/base-tool';
import type { ToolContext } from '../core/tool-context';
import { resolveAbs, fileExists, fileStat, readFileBuffer } from '../utils/server-fs';

const schema = z.object({
  images: z.union([z.string(), z.array(z.string())])
    .describe('Image path(s) or URL(s). Can be a single string or array of strings.'),
  question: z.string().default('Describe this image in detail.')
    .describe('Question about the image(s)'),
});

type Input = z.infer<typeof schema>;

const VALID_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB

export class AnalyzeImageTool extends BaseTool<Input, string> {
  name = 'analyze_image';
  description = 'Analyze one or more images using AI vision. Accepts file paths or URLs. Ask questions about image content, compare images, extract text from screenshots, or describe visual elements.';
  schema = schema;
  safety = { timeout: 120_000, retryCount: 0, maxResultSize: 25_000 };

  protected async _run(input: Input, ctx?: ToolContext): Promise<string> {
    const images = Array.isArray(input.images) ? input.images : [input.images];

    if (images.length === 0) {
      return 'Error: No images provided.';
    }

    if (images.length > 10) {
      return 'Error: Maximum 10 images per request.';
    }

    // Build vision content parts
    const contentParts: any[] = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      let imageUrl: string;

      if (img.startsWith('http://') || img.startsWith('https://')) {
        imageUrl = img;
      } else {
        // Local file
        const absPath = resolveAbs(img);
        if (!fileExists(absPath)) {
          return `Error: Image file not found: ${img}`;
        }

        const ext = path.extname(absPath).toLowerCase();
        if (!VALID_EXTENSIONS.has(ext)) {
          return `Error: Unsupported image format: ${ext}. Supported: ${[...VALID_EXTENSIONS].join(', ')}`;
        }

        const stat = fileStat(absPath);
        if (stat.size > MAX_IMAGE_SIZE) {
          return `Error: Image too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Max: 20MB.`;
        }

        const buffer = readFileBuffer(absPath);
        const mimeMap: Record<string, string> = {
          '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
          '.png': 'image/png', '.gif': 'image/gif',
          '.webp': 'image/webp',
        };
        const mime = mimeMap[ext] || 'image/png';
        imageUrl = `data:${mime};base64,${buffer.toString('base64')}`;
      }

      if (images.length > 1) {
        contentParts.push({ type: 'text', text: `[Image ${i + 1}]` });
      }
      contentParts.push({
        type: 'image_url',
        image_url: { url: imageUrl },
      });
    }

    contentParts.push({ type: 'text', text: input.question });

    if (!ctx?.callLlm) {
      return 'Error: Vision analysis requires LLM access (ToolContext.callLlm not available).';
    }

    const systemPrompt = 'You are a helpful vision assistant. Analyze the provided image(s) and answer the user\'s question in detail. Be thorough and specific.';
    const userContent = JSON.stringify(contentParts);

    const response = await ctx.callLlm(systemPrompt, userContent);

    if (typeof response === 'string') return response;
    if (response?.content) return response.content;
    return JSON.stringify(response);
  }
}

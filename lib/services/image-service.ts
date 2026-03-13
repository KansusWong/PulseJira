/**
 * ImageService — image analysis, generation, and editing.
 *
 * Architecture:
 *   analyze_image -> LLM vision call (OpenAI/Claude multimodal messages)
 *   generate_image -> External API (configurable: DALL-E / Flux / etc.)
 *   edit_image -> External API + image preprocessing via sharp
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImageGenOptions {
  filename?: string;
  aspectRatio?: string;
  quality?: string;
  outputDir?: string;
  seed?: number;
}

export interface ImageEditOptions {
  filename?: string;
  aspectRatio?: string;
  quality?: string;
  strength?: number;
  outputDir?: string;
  seed?: number;
}

export interface ImageResult {
  path: string;
  url?: string;
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: ImageService | null = null;

export function getImageService(): ImageService {
  if (!_instance) {
    _instance = new ImageService();
  }
  return _instance;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ImageService {
  private apiUrl: string;
  private apiKey: string;

  constructor() {
    this.apiUrl = process.env.IMAGE_API_URL || '';
    this.apiKey = process.env.IMAGE_API_KEY || '';
  }

  // -------------------------------------------------------------------------
  // Analyze (Vision)
  // -------------------------------------------------------------------------

  async analyzeImages(
    images: string[],
    question: string,
    callLlm: (system: string, user: string) => Promise<any>,
  ): Promise<string> {
    const imageContents: any[] = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      let dataUrl: string;

      if (img.startsWith('http://') || img.startsWith('https://')) {
        // Remote URL — pass directly
        dataUrl = img;
      } else {
        // Local file — convert to base64 data URL
        const absPath = path.isAbsolute(img) ? img : path.resolve(img);
        if (!fs.existsSync(absPath)) {
          throw new Error(`Image file not found: ${absPath}`);
        }

        const stat = fs.statSync(absPath);
        if (stat.size > 20 * 1024 * 1024) {
          throw new Error(`Image too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Max: 20MB.`);
        }

        const buffer = fs.readFileSync(absPath);
        const ext = path.extname(absPath).toLowerCase();
        const mimeMap: Record<string, string> = {
          '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
          '.png': 'image/png', '.gif': 'image/gif',
          '.webp': 'image/webp',
        };
        const mime = mimeMap[ext] || 'image/png';
        dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
      }

      if (images.length > 1) {
        imageContents.push({ type: 'text', text: `[Image ${i + 1}]` });
      }
      imageContents.push({
        type: 'image_url',
        image_url: { url: dataUrl },
      });
    }

    imageContents.push({ type: 'text', text: question });

    // Build a vision-compatible message
    const systemPrompt = 'You are a helpful vision assistant. Analyze the provided image(s) and answer the user\'s question in detail.';
    const userContent = JSON.stringify(imageContents);

    return await callLlm(systemPrompt, userContent);
  }

  // -------------------------------------------------------------------------
  // Generate
  // -------------------------------------------------------------------------

  async generateImage(prompt: string, options: ImageGenOptions = {}): Promise<ImageResult> {
    if (!this.apiUrl || !this.apiKey) {
      throw new Error(
        'Image generation not configured. Set IMAGE_API_URL and IMAGE_API_KEY environment variables.'
      );
    }

    // Map aspect ratio to size
    const sizeMap: Record<string, string> = {
      '1:1': '1024x1024',
      '16:9': '1792x1024',
      '9:16': '1024x1792',
      '4:3': '1024x768',
      '3:4': '768x1024',
      '21:9': '2016x864',
    };
    const size = sizeMap[options.aspectRatio || '1:1'] || '1024x1024';

    const reqBody: Record<string, any> = {
      model: process.env.IMAGE_MODEL_NAME || 'dall-e-3',
      prompt,
      n: 1,
      size,
      quality: options.quality || 'standard',
      response_format: 'b64_json',
    };
    if (options.seed !== undefined) {
      reqBody.seed = options.seed;
    }

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(reqBody),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Image generation API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const b64 = data.data?.[0]?.b64_json;
    const imageUrl = data.data?.[0]?.url;

    if (!b64 && !imageUrl) {
      throw new Error('Image generation returned no image data.');
    }

    // Save to file
    const outputDir = options.outputDir || os.tmpdir();
    const filename = options.filename || `generated_${Date.now()}.png`;
    const outputPath = path.join(outputDir, filename);

    if (b64) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, Buffer.from(b64, 'base64'));
    } else if (imageUrl) {
      const imgResp = await fetch(imageUrl);
      const imgBuffer = Buffer.from(await imgResp.arrayBuffer());
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, imgBuffer);
    }

    return { path: outputPath, url: imageUrl };
  }

  // -------------------------------------------------------------------------
  // Edit
  // -------------------------------------------------------------------------

  async editImage(
    prompt: string,
    imagePaths: string[],
    options: ImageEditOptions = {},
  ): Promise<ImageResult> {
    if (!this.apiUrl || !this.apiKey) {
      throw new Error(
        'Image editing not configured. Set IMAGE_API_URL and IMAGE_API_KEY environment variables.'
      );
    }

    // Compress images if needed (>5MB -> resize + JPEG compress)
    const processedImages: Buffer[] = [];
    for (const imgPath of imagePaths) {
      const absPath = path.isAbsolute(imgPath) ? imgPath : path.resolve(imgPath);
      if (!fs.existsSync(absPath)) {
        throw new Error(`Image not found: ${absPath}`);
      }

      let buffer: Buffer = fs.readFileSync(absPath);

      // Compress large images using sharp
      if (buffer.length > 5 * 1024 * 1024) {
        try {
          const sharpModule = await import('sharp');
          const sharpFn = sharpModule.default || sharpModule;
          buffer = await (sharpFn as any)(buffer)
            .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();
        } catch {
          // If sharp fails, use the original buffer
        }
      }
      processedImages.push(buffer);
    }

    // Build the edit API URL
    const editUrl = this.apiUrl.replace('/generations', '/edits');

    // Use FormData for multipart upload
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('model', process.env.IMAGE_MODEL_NAME || 'dall-e-2');
    formData.append('n', '1');
    formData.append('size', '1024x1024');

    // Attach the first image
    if (processedImages.length > 0) {
      const blob = new Blob([new Uint8Array(processedImages[0])], { type: 'image/png' });
      formData.append('image', blob, 'image.png');
    }

    const response = await fetch(editUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: formData,
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Image edit API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const b64 = data.data?.[0]?.b64_json;
    const imageUrl = data.data?.[0]?.url;

    const outputDir = options.outputDir || os.tmpdir();
    const filename = options.filename || `edited_${Date.now()}.png`;
    const outputPath = path.join(outputDir, filename);

    if (b64) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, Buffer.from(b64, 'base64'));
    } else if (imageUrl) {
      const imgResp = await fetch(imageUrl);
      const imgBuffer = Buffer.from(await imgResp.arrayBuffer());
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, imgBuffer);
    } else {
      throw new Error('Image edit returned no image data.');
    }

    return { path: outputPath, url: imageUrl };
  }

  // -------------------------------------------------------------------------
  // Status
  // -------------------------------------------------------------------------

  isConfigured(): boolean {
    return !!(this.apiUrl && this.apiKey);
  }
}

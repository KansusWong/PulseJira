/**
 * VideoService — video generation via external API.
 *
 * Supports text-to-video and image-to-video modes.
 * Uses async task pattern: submit -> poll -> download.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VideoGenOptions {
  filename?: string;
  image?: string;
  aspectRatio?: string;
  duration?: string;
  outputDir?: string;
}

export interface VideoResult {
  path: string;
  url?: string;
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: VideoService | null = null;

export function getVideoService(): VideoService {
  if (!_instance) {
    _instance = new VideoService();
  }
  return _instance;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class VideoService {
  private apiUrl: string;
  private apiKey: string;
  private pollIntervalMs = 5_000;
  private maxPollTimeMs = 300_000; // 5 minutes

  constructor() {
    this.apiUrl = process.env.VIDEO_API_URL || '';
    this.apiKey = process.env.VIDEO_API_KEY || '';
  }

  async generateVideo(prompt: string, options: VideoGenOptions = {}): Promise<VideoResult> {
    if (!this.apiUrl || !this.apiKey) {
      throw new Error(
        'Video generation not configured. Set VIDEO_API_URL and VIDEO_API_KEY environment variables.'
      );
    }

    // Build request body
    const body: Record<string, any> = {
      prompt,
      aspect_ratio: options.aspectRatio || '16:9',
      duration: options.duration || '5',
    };

    // Image-to-video mode
    if (options.image) {
      const imgPath = path.isAbsolute(options.image) ? options.image : path.resolve(options.image);
      if (fs.existsSync(imgPath)) {
        const buffer = fs.readFileSync(imgPath);
        body.image = `data:image/png;base64,${buffer.toString('base64')}`;
      } else if (options.image.startsWith('http')) {
        body.image = options.image;
      }
    }

    // Submit task
    const submitResponse = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!submitResponse.ok) {
      const errText = await submitResponse.text();
      throw new Error(`Video generation API error (${submitResponse.status}): ${errText}`);
    }

    const submitData = await submitResponse.json();
    const taskId = submitData.id || submitData.task_id || submitData.generation_id;

    if (!taskId) {
      // If API returns the video directly (synchronous mode)
      const videoUrl = submitData.url || submitData.video_url;
      if (videoUrl) {
        return this.downloadVideo(videoUrl, options);
      }
      throw new Error('Video generation API did not return a task ID or video URL.');
    }

    // Poll for completion
    return this.pollAndDownload(taskId, options);
  }

  private async pollAndDownload(taskId: string, options: VideoGenOptions): Promise<VideoResult> {
    const startTime = Date.now();
    const statusUrl = `${this.apiUrl}/${taskId}`;

    while (Date.now() - startTime < this.maxPollTimeMs) {
      await this.sleep(this.pollIntervalMs);

      const response = await fetch(statusUrl, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) continue;

      const data = await response.json();
      const status = data.status || data.state;

      if (status === 'completed' || status === 'succeeded' || status === 'done') {
        const videoUrl = data.url || data.video_url || data.output?.url;
        if (!videoUrl) {
          throw new Error('Video generation completed but no video URL returned.');
        }
        return this.downloadVideo(videoUrl, options);
      }

      if (status === 'failed' || status === 'error') {
        throw new Error(`Video generation failed: ${data.error || data.message || 'Unknown error'}`);
      }

      // Still processing — continue polling
    }

    throw new Error(`Video generation timed out after ${this.maxPollTimeMs / 1000}s.`);
  }

  private async downloadVideo(url: string, options: VideoGenOptions): Promise<VideoResult> {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const outputDir = options.outputDir || os.tmpdir();
    const filename = options.filename || `video_${Date.now()}.mp4`;
    const outputPath = path.join(outputDir, filename);

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, buffer);

    return { path: outputPath, url };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  isConfigured(): boolean {
    return !!(this.apiUrl && this.apiKey);
  }
}

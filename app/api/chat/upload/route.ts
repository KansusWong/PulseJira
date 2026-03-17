import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import type { AttachmentMeta } from '@/lib/core/types';

export const runtime = 'nodejs';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_FILES = 5;

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const DOC_EXTS = new Set(['.pdf', '.docx', '.xlsx', '.xls', '.csv', '.txt', '.md']);
const ALLOWED_EXTS = new Set([...IMAGE_EXTS, ...DOC_EXTS]);

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
};

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const conversationId = (formData.get('conversation_id') as string) || 'default';
    const files: File[] = [];

    // Collect all files from the form data
    for (const [key, value] of formData.entries()) {
      if (key === 'files' && value instanceof File) {
        files.push(value);
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No files provided' },
        { status: 400 },
      );
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { success: false, error: `Maximum ${MAX_FILES} files per upload` },
        { status: 400 },
      );
    }

    // Create conversation uploads directory
    const convDir = path.join(UPLOADS_DIR, conversationId);
    fs.mkdirSync(convDir, { recursive: true });

    const results: AttachmentMeta[] = [];

    for (const file of files) {
      // Validate extension
      const ext = path.extname(file.name).toLowerCase();
      if (!ALLOWED_EXTS.has(ext)) {
        return NextResponse.json(
          { success: false, error: `Unsupported file type: ${ext}` },
          { status: 400 },
        );
      }

      // Validate size
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { success: false, error: `File too large: ${file.name} (max 20MB)` },
          { status: 400 },
        );
      }

      // Generate unique filename
      const prefix = crypto.randomUUID().slice(0, 8);
      const safeName = file.name.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, '_');
      const filename = `${prefix}_${safeName}`;
      const absolutePath = path.join(convDir, filename);

      // Write file to disk
      const buffer = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(absolutePath, buffer);

      const isImage = IMAGE_EXTS.has(ext);
      results.push({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        type: isImage ? 'image' : 'document',
        mimeType: MIME_MAP[ext] || 'application/octet-stream',
        relativePath: `uploads/${conversationId}/${filename}`,
        absolutePath,
      });
    }

    return NextResponse.json({ success: true, files: results });
  } catch (e: any) {
    console.error('[upload] Error:', e);
    return NextResponse.json(
      { success: false, error: e.message || 'Upload failed' },
      { status: 500 },
    );
  }
}

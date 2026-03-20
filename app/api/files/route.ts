import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
  html: 'text/html',
  json: 'application/json',
};

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get('path');
  const workspace = req.nextUrl.searchParams.get('workspace');

  if (!filePath || !workspace) {
    return NextResponse.json({ error: 'Missing path or workspace parameter' }, { status: 400 });
  }

  const absPath = path.resolve(workspace, filePath);

  // Security: ensure resolved path is inside workspace
  const normalizedWorkspace = path.normalize(workspace);
  const normalizedAbs = path.normalize(absPath);
  if (!normalizedAbs.startsWith(normalizedWorkspace)) {
    return NextResponse.json({ error: 'Path traversal denied' }, { status: 403 });
  }

  if (!fs.existsSync(absPath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const contentType = MIME_MAP[ext] || 'application/octet-stream';
  const fileBuffer = fs.readFileSync(absPath);

  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${path.basename(filePath)}"`,
      'Cache-Control': 'no-cache',
    },
  });
}

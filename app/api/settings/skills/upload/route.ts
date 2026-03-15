import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import AdmZip from 'adm-zip';
import { loadSkillFromDir } from '@/lib/skills/skill-loader';
import { registerSkill } from '@/lib/skills/skill-registry';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

function sanitizeId(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function ensureSkillDir(skillId: string): string {
  const skillDir = path.join(process.cwd(), 'skills', skillId);
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true });
  }
  return skillDir;
}

/**
 * POST /api/settings/skills/upload
 *
 * Supports two modes:
 * 1. multipart/form-data — file upload (zip or single .md)
 * 2. application/json — text paste { skillId, content }
 */
export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      return handleTextPaste(req);
    }

    if (contentType.includes('multipart/form-data')) {
      return handleFileUpload(req);
    }

    return NextResponse.json(
      { success: false, error: 'Unsupported Content-Type. Use multipart/form-data or application/json.' },
      { status: 400 },
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'Upload failed' },
      { status: 500 },
    );
  }
}

async function handleTextPaste(req: Request) {
  const body = await req.json();
  const skillId = sanitizeId(String(body.skillId || ''));
  const content = String(body.content || '').trim();

  if (!skillId) {
    return NextResponse.json({ success: false, error: 'skillId is required' }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ success: false, error: 'content is required' }, { status: 400 });
  }
  if (content.length > MAX_FILE_SIZE) {
    return NextResponse.json({ success: false, error: `Content exceeds ${MAX_FILE_SIZE} byte limit` }, { status: 400 });
  }

  const skillDir = ensureSkillDir(skillId);
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf-8');

  return validateAndRegister(skillId, skillDir);
}

async function handleFileUpload(req: Request) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const skillIdRaw = formData.get('skillId') as string | null;

  if (!file) {
    return NextResponse.json({ success: false, error: 'file field is required' }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { success: false, error: `File exceeds ${MAX_FILE_SIZE} byte limit` },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name || '';
  const isZip = fileName.endsWith('.zip') || file.type === 'application/zip';

  if (isZip) {
    return handleZipUpload(buffer, skillIdRaw);
  }

  // Single .md file
  const skillId = sanitizeId(skillIdRaw || fileName.replace(/\.md$/i, '').replace(/^SKILL$/i, 'custom-skill'));
  if (!skillId) {
    return NextResponse.json({ success: false, error: 'skillId is required for .md upload' }, { status: 400 });
  }

  const skillDir = ensureSkillDir(skillId);
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), buffer);

  return validateAndRegister(skillId, skillDir);
}

function handleZipUpload(buffer: Buffer, skillIdHint: string | null) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  // Determine skill ID: from hint, or from root directory name in zip, or from SKILL.md name field
  let detectedId = sanitizeId(skillIdHint || '');

  // Security: check for path traversal in all entries
  for (const entry of entries) {
    const entryName = entry.entryName;
    if (entryName.includes('..') || entryName.includes('\0') || path.isAbsolute(entryName)) {
      return NextResponse.json(
        { success: false, error: `Path traversal detected in zip entry: ${entryName}` },
        { status: 400 },
      );
    }
  }

  // Find SKILL.md in zip (may be at root or inside a single subdirectory)
  let skillMdEntry = entries.find((e) => e.entryName === 'SKILL.md');
  let prefix = '';

  if (!skillMdEntry) {
    // Check for a single directory root containing SKILL.md
    const dirs = new Set(entries.filter((e) => e.isDirectory).map((e) => e.entryName.split('/')[0]));
    if (dirs.size === 1) {
      const rootDir = Array.from(dirs)[0];
      skillMdEntry = entries.find((e) => e.entryName === `${rootDir}/SKILL.md`);
      if (skillMdEntry) {
        prefix = `${rootDir}/`;
        if (!detectedId) detectedId = sanitizeId(rootDir);
      }
    }
  }

  if (!skillMdEntry) {
    return NextResponse.json(
      { success: false, error: 'No SKILL.md found in zip archive' },
      { status: 400 },
    );
  }

  if (!detectedId) detectedId = 'uploaded-skill';

  const skillDir = ensureSkillDir(detectedId);

  // Extract entries
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    let relativePath = entry.entryName;
    if (prefix && relativePath.startsWith(prefix)) {
      relativePath = relativePath.slice(prefix.length);
    }
    if (!relativePath) continue;

    // Only allow known subdirectories + SKILL.md
    const allowed = ['SKILL.md', 'references/', 'scripts/', 'assets/'];
    const isAllowed = allowed.some((a) => relativePath === a || relativePath.startsWith(a));
    if (!isAllowed) continue;

    const targetPath = path.join(skillDir, relativePath);
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.writeFileSync(targetPath, entry.getData());
  }

  return validateAndRegister(detectedId, skillDir);
}

function validateAndRegister(skillId: string, skillDir: string) {
  const def = loadSkillFromDir(skillDir, { warnOnInvalid: true });

  if (!def) {
    return NextResponse.json(
      { success: false, error: 'Invalid SKILL.md format: missing frontmatter or required fields (name, description)' },
      { status: 400 },
    );
  }

  registerSkill(def);

  const hasResources = !!(def.resources &&
    (def.resources.references.length > 0 ||
     def.resources.scripts.length > 0 ||
     def.resources.assets.length > 0));

  // Return directory slug (skillId) as canonical ID, not def.id (SKILL.md name).
  // SKILL.md name may contain non-ASCII chars that break downstream sanitizeId calls.
  return NextResponse.json({
    success: true,
    data: {
      skillId,
      description: def.description,
      hasResources,
    },
  });
}

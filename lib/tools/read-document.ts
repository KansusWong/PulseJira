/**
 * read_document — Read and parse various document formats.
 *
 * Supports: PDF, CSV, Excel (.xlsx/.xls), Word (.docx), and plain text.
 * Workspace-scoped tool (requires workspace path for file resolution).
 */

import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { BaseTool } from '../core/base-tool';
import type { ToolContext } from '../core/tool-context';

const schema = z.object({
  path: z.string().describe('File path (relative to workspace)'),
  pages: z.string().optional().describe('Page range for PDF: "1-5" or "1,3,5"'),
  sheet: z.union([z.string(), z.number()]).optional().describe('Sheet name or index for Excel'),
  max_rows: z.number().default(1000).describe('Max rows for tabular data'),
  extract_tables: z.boolean().default(false).describe('Extract tables from PDF'),
  info_only: z.boolean().default(false).describe('Return metadata only, not content'),
});

type Input = z.infer<typeof schema>;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_CONTENT_LENGTH = 100_000; // 100KB output

export class ReadDocumentTool extends BaseTool<Input, string> {
  name = 'read_document';
  description = 'Read and parse documents (PDF, CSV, Excel, Word .docx, text). Returns extracted text content. For tabular data, returns formatted rows. Use info_only=true to get file metadata without content.';
  schema = schema;

  private workspaceRoot?: string;

  constructor(cwd?: string) {
    super();
    if (cwd) {
      this.workspaceRoot = path.normalize(cwd);
    }
  }

  protected async _run(input: Input, ctx?: ToolContext): Promise<string> {
    const wsRoot = this.workspaceRoot || ctx?.workspacePath || '.';
    const filePath = path.resolve(wsRoot, input.path);

    // Security: prevent path traversal
    if (!filePath.startsWith(path.resolve(wsRoot))) {
      throw new Error('Path traversal detected: file must be within workspace.');
    }

    if (!fs.existsSync(filePath)) {
      return `Error: File not found: ${input.path}`;
    }

    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_SIZE) {
      return `Error: File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Maximum: 50MB.`;
    }

    const ext = path.extname(filePath).toLowerCase();

    if (input.info_only) {
      return JSON.stringify({
        name: path.basename(filePath),
        size: stat.size,
        sizeHuman: formatSize(stat.size),
        extension: ext,
        modified: stat.mtime.toISOString(),
      }, null, 2);
    }

    try {
      switch (ext) {
        case '.pdf':
          return await this.readPdf(filePath, input.pages);
        case '.csv':
          return await this.readCsv(filePath, input.max_rows);
        case '.xlsx':
        case '.xls':
          return await this.readExcel(filePath, input.sheet, input.max_rows);
        case '.docx':
          return await this.readDocx(filePath);
        case '.txt':
        case '.md':
        case '.json':
        case '.xml':
        case '.yaml':
        case '.yml':
        case '.log':
          return this.readText(filePath);
        default:
          // Try reading as text
          return this.readText(filePath);
      }
    } catch (err: any) {
      return `Error reading ${input.path}: ${err.message}`;
    }
  }

  private async readPdf(filePath: string, pages?: string): Promise<string> {
    const pdfModule = await import('pdf-parse');
    const pdfParse = (pdfModule as any).default || pdfModule;
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer, {
      max: pages ? parseMaxPage(pages) : 0,
    });

    let content = data.text;

    // Apply page filtering if specified
    if (pages) {
      // pdf-parse doesn't support page ranges natively,
      // so we include full text but note the page count
      content = `[PDF: ${data.numpages} pages total]\n\n${content}`;
    } else {
      content = `[PDF: ${data.numpages} pages]\n\n${content}`;
    }

    return content.slice(0, MAX_CONTENT_LENGTH);
  }

  private async readCsv(filePath: string, maxRows: number): Promise<string> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    const totalRows = lines.length - 1; // minus header

    const shownLines = lines.slice(0, maxRows + 1); // header + maxRows
    let result = shownLines.join('\n');

    if (totalRows > maxRows) {
      result += `\n\n[Showing ${maxRows} of ${totalRows} rows]`;
    }

    return result.slice(0, MAX_CONTENT_LENGTH);
  }

  private async readExcel(filePath: string, sheet?: string | number, maxRows: number = 1000): Promise<string> {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(fs.readFileSync(filePath), { type: 'buffer' });

    // Select sheet
    let sheetName: string;
    if (typeof sheet === 'number') {
      sheetName = workbook.SheetNames[sheet] || workbook.SheetNames[0];
    } else if (typeof sheet === 'string') {
      sheetName = workbook.SheetNames.includes(sheet) ? sheet : workbook.SheetNames[0];
    } else {
      sheetName = workbook.SheetNames[0];
    }

    const ws = workbook.Sheets[sheetName];
    if (!ws) {
      return `Error: Sheet "${sheetName}" not found. Available: ${workbook.SheetNames.join(', ')}`;
    }

    const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
    const totalRows = jsonData.length - 1;

    // Format as CSV-like text
    const rows = jsonData.slice(0, maxRows + 1);
    const result = rows.map(row => row.join('\t')).join('\n');

    let output = `[Sheet: ${sheetName}] [Sheets: ${workbook.SheetNames.join(', ')}]\n\n${result}`;
    if (totalRows > maxRows) {
      output += `\n\n[Showing ${maxRows} of ${totalRows} rows]`;
    }

    return output.slice(0, MAX_CONTENT_LENGTH);
  }

  private async readDocx(filePath: string): Promise<string> {
    const mammoth = await import('mammoth');
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return result.value.slice(0, MAX_CONTENT_LENGTH);
  }

  private readText(filePath: string): string {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.slice(0, MAX_CONTENT_LENGTH);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function parseMaxPage(pages: string): number {
  // Extract the largest page number from range strings like "1-5" or "1,3,5"
  const nums = pages.match(/\d+/g);
  if (!nums) return 0;
  return Math.max(...nums.map(Number));
}

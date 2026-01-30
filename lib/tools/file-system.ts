import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

export const listFilesTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "list_files",
    description: "List files and directories in a given path to understand project structure.",
    parameters: {
      type: "object",
      properties: {
        dir: { type: "string", description: "Relative path to directory (e.g., 'lib/agents')" }
      },
      required: ["dir"]
    }
  }
};

export async function listFilesExecutor(args: { dir: string }): Promise<string> {
  const cwd = process.cwd();
  const targetPath = path.resolve(cwd, args.dir || '.');

  // Security: Prevent path traversal
  if (!targetPath.startsWith(cwd)) {
    return `Error: Access denied. Cannot access files outside the project directory.`;
  }
  
  if (!fs.existsSync(targetPath)) {
    return `Error: Directory '${args.dir}' does not exist.`;
  }
  
  try {
    // FIX: Use async readdir to avoid blocking the event loop
    const files = await fs.promises.readdir(targetPath);
    // Filter out hidden/node_modules for noise reduction
    const filtered = files.filter(f => !f.startsWith('.') && f !== 'node_modules');
    
    const limit = 50;
    const result = filtered.slice(0, limit);
    const hasMore = filtered.length > limit;

    let output = JSON.stringify(result);
    if (hasMore) {
        output += `\n(and ${filtered.length - limit} more files)`;
    }
    return output;
  } catch (e: any) {
    return `Error listing files: ${e.message}`;
  }
}

export const readFileTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "read_file",
    description: "Read the contents of a file to understand code logic and context.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path to file (e.g., 'lib/utils.ts')" }
      },
      required: ["path"]
    }
  }
};

export async function readFileExecutor(args: { path: string }): Promise<string> {
  const cwd = process.cwd();
  const targetPath = path.resolve(cwd, args.path);

  // Security: Prevent path traversal
  if (!targetPath.startsWith(cwd)) {
    return `Error: Access denied. Cannot read files outside the project directory.`;
  }
  
  if (!fs.existsSync(targetPath)) {
    return `Error: File '${args.path}' does not exist.`;
  }
  
  try {
    // FIX: Use async readFile to avoid blocking
    const content = await fs.promises.readFile(targetPath, 'utf-8');
    
    // FIX: Explicit truncation warning
    const LIMIT = 8000;
    if (content.length > LIMIT) {
      return content.slice(0, LIMIT) + `\n\n...[Content Truncated: File too large (${content.length} chars), showing first ${LIMIT} chars]...`;
    }
    return content;
  } catch (e: any) {
    return `Error reading file: ${e.message}`;
  }
}

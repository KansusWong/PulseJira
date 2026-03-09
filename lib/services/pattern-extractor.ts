/**
 * Pattern Extractor — extracts reusable code patterns from successful implementation tasks.
 *
 * Called asynchronously (fire-and-forget) after a task completes successfully.
 * Uses LLM to analyze the task output and identify reusable patterns,
 * then stores them via the store_code_pattern tool.
 */

import { generateJSON } from '../core/llm';
import { supabase } from '../db/client';
import { generateEmbedding } from './rag';

interface TaskOutput {
  taskId: string;
  projectId?: string;
  title: string;
  description: string;
  filesChanged: string[];
  summary: string;
}

interface ExtractedPattern {
  name: string;
  description: string;
  pattern_type: string;
  content: string;
  language?: string;
  tags: string[];
}

const EXTRACTION_PROMPT = `你是一个代码模式提取专家。分析以下成功完成的实现任务，提取可复用的代码模式。

只提取具有通用价值的模式，忽略过于特定的实现细节。

返回 JSON 格式：
{
  "patterns": [
    {
      "name": "模式简短名称",
      "description": "模式描述：用途、适用场景、注意事项",
      "pattern_type": "file_structure|architecture|api_pattern|component|test_pattern|error_handling|data_model|other",
      "content": "模式的代码结构或关键代码片段",
      "language": "编程语言",
      "tags": ["标签1", "标签2"]
    }
  ]
}

如果没有可提取的通用模式，返回空数组 {"patterns": []}。`;

/**
 * Extract and store reusable patterns from a completed task.
 * This is a fire-and-forget operation — errors are logged but never thrown.
 */
export async function extractAndStorePatterns(task: TaskOutput): Promise<void> {
  try {
    const userContent = `任务标题：${task.title}
任务描述：${task.description}
实现总结：${task.summary}
修改的文件：${task.filesChanged.join(', ')}`;

    const result = await generateJSON(EXTRACTION_PROMPT, userContent);
    const patterns: ExtractedPattern[] = result?.patterns || [];

    if (patterns.length === 0) {
      console.log(`[pattern-extractor] No reusable patterns found in task "${task.title}"`);
      return;
    }

    for (const pattern of patterns) {
      const embeddingText = `${pattern.name} ${pattern.description} ${pattern.content}`;
      const embedding = await generateEmbedding(embeddingText);

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const safeTaskId = task.taskId && uuidRegex.test(task.taskId) ? task.taskId : null;
      const safeProjectId = task.projectId && uuidRegex.test(task.projectId) ? task.projectId : null;

      const { error } = await supabase.from('code_patterns').insert({
        name: pattern.name,
        description: pattern.description,
        pattern_type: pattern.pattern_type,
        content: pattern.content,
        language: pattern.language || null,
        tags: pattern.tags || [],
        project_id: safeProjectId,
        task_id: safeTaskId,
        embedding: embedding.length > 0 ? embedding : null,
      });

      if (error) {
        console.error(`[pattern-extractor] Failed to store pattern "${pattern.name}":`, error);
      } else {
        console.log(`[pattern-extractor] Stored pattern: "${pattern.name}"`);
      }
    }
  } catch (error) {
    console.error('[pattern-extractor] Extraction failed:', error);
    // Fire-and-forget: never throw
  }
}

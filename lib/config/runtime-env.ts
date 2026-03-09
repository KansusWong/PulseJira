/**
 * Runtime environment override module.
 * Reads/writes `.env.local`, hot-patches `process.env`, and defines env group metadata.
 */
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// ENV_GROUPS — canonical list of managed environment variables
// ---------------------------------------------------------------------------

export interface EnvVarMeta {
  key: string;
  label: string;
  isSecret: boolean;
  placeholder: string;
  helpText?: string;
}

export interface EnvGroupMeta {
  id: string;
  label: string;
  icon: string;
  required: boolean;
  vars: EnvVarMeta[];
}

export const ENV_GROUPS: EnvGroupMeta[] = [
  {
    id: "supabase",
    label: "Supabase (必填优先)",
    icon: "Database",
    required: true,
    vars: [
      {
        key: "NEXT_PUBLIC_SUPABASE_URL",
        label: "Supabase 项目 URL",
        isSecret: false,
        placeholder: "https://xxx.supabase.co",
        helpText: "修改后服务端立即生效，客户端需重新构建",
      },
      {
        key: "SUPABASE_SERVICE_ROLE_KEY",
        label: "Service Role Key",
        isSecret: true,
        placeholder: "eyJhbGci...",
        helpText: "从 Supabase Dashboard → Settings → API 获取",
      },
    ],
  },
  {
    id: "llm",
    label: "主 LLM 模型",
    icon: "Brain",
    required: true,
    vars: [
      {
        key: "OPENAI_API_KEY",
        label: "API Key (OpenAI 兼容)",
        isSecret: true,
        placeholder: "sk-...",
      },
      {
        key: "OPENAI_BASE_URL",
        label: "Base URL",
        isSecret: false,
        placeholder: "https://api.openai.com/v1/",
        helpText: "兼容 OpenAI SDK 的接口地址",
      },
      {
        key: "LLM_MODEL_NAME",
        label: "模型名称",
        isSecret: false,
        placeholder: "gpt-4o",
      },
      {
        key: "EMBEDDING_MODEL_NAME",
        label: "Embedding 模型",
        isSecret: false,
        placeholder: "text-embedding-3-small",
      },
    ],
  },
  {
    id: "deepseek",
    label: "备用LLM模型（可选）",
    icon: "Shield",
    required: false,
    vars: [
      {
        key: "DEEPSEEK_API_KEY",
        label: "API Key（OpenAI 兼容）",
        isSecret: true,
        placeholder: "sk-...",
      },
      {
        key: "DEEPSEEK_BASE_URL",
        label: "Base URL",
        isSecret: false,
        placeholder: "https://api.openai.com/v1/",
        helpText: "可配置任意 OpenAI 兼容服务地址（用于红队优先调用）",
      },
      {
        key: "DEEPSEEK_MODEL_NAME",
        label: "模型名称",
        isSecret: false,
        placeholder: "gpt-4o-mini / deepseek-reasoner / glm-4.5",
      },
    ],
  },
  {
    id: "scraping",
    label: "网页抓取",
    icon: "Globe",
    required: false,
    vars: [
      {
        key: "CRAWL4AI_API_URL",
        label: "Crawl4AI API URL",
        isSecret: false,
        placeholder: "http://localhost:11235/crawl",
        helpText: "填写 Crawl4AI 服务端 /crawl 接口完整地址",
      },
    ],
  },
  {
    id: "social",
    label: "社交平台",
    icon: "Share2",
    required: false,
    vars: [
      {
        key: "TWITTER_BEARER_TOKEN",
        label: "Twitter Bearer Token",
        isSecret: true,
        placeholder: "AAAA...",
      },
      {
        key: "YOUTUBE_API_KEY",
        label: "YouTube API Key",
        isSecret: true,
        placeholder: "AIza...",
      },
      {
        key: "REDDIT_CLIENT_ID",
        label: "Reddit Client ID",
        isSecret: true,
        placeholder: "Reddit Client ID",
      },
      {
        key: "REDDIT_CLIENT_SECRET",
        label: "Reddit Client Secret",
        isSecret: true,
        placeholder: "Reddit Client Secret",
      },
    ],
  },
  {
    id: "cicd",
    label: "CI/CD (可选)",
    icon: "GitBranch",
    required: false,
    vars: [
      {
        key: "GITHUB_TOKEN",
        label: "GitHub Token",
        isSecret: true,
        placeholder: "ghp_...",
      },
    ],
  },
  {
    id: "auth",
    label: "认证与权限",
    icon: "Shield",
    required: false,
    vars: [
      {
        key: "AUTH_ENABLED",
        label: "启用 API 认证",
        isSecret: false,
        placeholder: "false",
        helpText: "设置为 true 后所有 API 端点需要 API Key 认证",
      },
      {
        key: "BOOTSTRAP_SECRET",
        label: "引导密钥（一次性使用）",
        isSecret: true,
        placeholder: "your-bootstrap-secret",
        helpText: "用于创建第一个 Admin API Key，创建后可删除",
      },
    ],
  },
];

/** Flat list of all managed keys for white-list validation */
export const MANAGED_KEYS = ENV_GROUPS.flatMap((g) =>
  g.vars.map((v) => v.key)
);

// ---------------------------------------------------------------------------
// .env.local file path
// ---------------------------------------------------------------------------

function getEnvFilePath(): string {
  return path.resolve(process.cwd(), ".env.local");
}

// ---------------------------------------------------------------------------
// Minimal .env parser (avoid heavy dependency — just key=value with quotes)
// ---------------------------------------------------------------------------

function parseEnvContent(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Read `.env.local` and patch `process.env` for all managed keys.
 * Safe to call multiple times — idempotent.
 */
export function loadRuntimeOverrides(): void {
  const envPath = getEnvFilePath();
  if (!fs.existsSync(envPath)) return;

  try {
    const content = fs.readFileSync(envPath, "utf-8");
    const parsed = parseEnvContent(content);
    for (const key of MANAGED_KEYS) {
      if (parsed[key] !== undefined) {
        process.env[key] = parsed[key];
      }
    }
  } catch {
    // Silently ignore read errors (e.g., permission issues)
  }
}

/**
 * Mask a value for safe display — show only last 4 chars.
 */
function maskValue(value: string | undefined): string {
  if (!value) return "";
  if (value.length <= 4) return "****";
  return "****" + value.slice(-4);
}

export interface EnvVarStatus {
  key: string;
  configured: boolean;
  maskedValue: string;
}

/**
 * Return the configuration status of every managed env var (safe to expose).
 */
export function getRuntimeEnvStatus(): EnvVarStatus[] {
  return MANAGED_KEYS.map((key) => {
    const value = process.env[key];
    return {
      key,
      configured: !!value,
      maskedValue: maskValue(value),
    };
  });
}

/**
 * Compute group-level status from individual var statuses.
 */
export function getGroupStatus(
  groupVars: EnvVarMeta[],
  statusMap: Map<string, EnvVarStatus>
): "configured" | "partial" | "missing" {
  const total = groupVars.length;
  const configured = groupVars.filter(
    (v) => statusMap.get(v.key)?.configured
  ).length;
  if (configured === total) return "configured";
  if (configured > 0) return "partial";
  return "missing";
}

/**
 * Check whether the filesystem is writable (for self-hosted detection).
 */
export function isEnvFileWritable(): boolean {
  const envPath = getEnvFilePath();
  try {
    // If file exists, check write permission; otherwise check directory
    if (fs.existsSync(envPath)) {
      fs.accessSync(envPath, fs.constants.W_OK);
    } else {
      fs.accessSync(path.dirname(envPath), fs.constants.W_OK);
    }
    return true;
  } catch {
    return false;
  }
}

// Comment headers for each group when serialising
const GROUP_COMMENTS: Record<string, string> = {
  supabase: "# Supabase Configuration (Required for RAG & Agents)",
  llm: "# LLM / OpenAI-compatible Configuration",
  deepseek: "# Backup LLM Configuration (Optional, preferred by Red Team)",
  scraping: "# Web Scraping",
  social: "# Platform API Keys",
  cicd: "# CI/CD",
  auth: "# Authentication & RBAC",
};

/**
 * Write updated env values to `.env.local` and hot-patch `process.env`.
 * Merges with existing values — empty string values remove the key.
 */
export function writeEnvFile(updates: Record<string, string>): void {
  const envPath = getEnvFilePath();

  // Read existing values
  let existing: Record<string, string> = {};
  if (fs.existsSync(envPath)) {
    try {
      existing = parseEnvContent(fs.readFileSync(envPath, "utf-8"));
    } catch {
      // Start fresh if unreadable
    }
  }

  // Merge — empty string means "remove"
  for (const [key, value] of Object.entries(updates)) {
    if (!MANAGED_KEYS.includes(key)) continue;
    if (value === "") {
      delete existing[key];
    } else {
      existing[key] = value;
    }
  }

  // Serialize grouped output
  const lines: string[] = [];
  for (const group of ENV_GROUPS) {
    const groupKeys = group.vars.map((v) => v.key);
    const hasAny = groupKeys.some((k) => existing[k] !== undefined);
    if (!hasAny) continue;

    if (lines.length > 0) lines.push("");
    lines.push(GROUP_COMMENTS[group.id] || `# ${group.label}`);
    for (const v of group.vars) {
      if (existing[v.key] !== undefined) {
        lines.push(`${v.key}="${existing[v.key]}"`);
      }
    }
  }

  // Write any remaining non-managed keys that were in the original file
  const managedSet = new Set(MANAGED_KEYS);
  const extraKeys = Object.keys(existing).filter((k) => !managedSet.has(k));
  if (extraKeys.length > 0) {
    lines.push("");
    lines.push("# Other");
    for (const k of extraKeys) {
      lines.push(`${k}="${existing[k]}"`);
    }
  }

  lines.push(""); // trailing newline
  fs.writeFileSync(envPath, lines.join("\n"), "utf-8");

  // Hot-patch process.env
  loadRuntimeOverrides();
}

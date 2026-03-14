import OpenAI from "openai";
import { getLLMPool } from "@/lib/services/llm-pool";

export interface RedTeamRuntimeConfig {
  model: string;
  source: "pool" | "backup-env" | "primary";
  label: string;
  client?: OpenAI;
  poolTags?: string[];
  accountId?: string;
  accountName?: string;
}

function getPrimaryModel(): string {
  return (process.env.LLM_MODEL_NAME || "glm-5").trim();
}

function getBackupEnvConfig(primaryModel: string): { apiKey: string; baseURL?: string; model: string } | null {
  // Keep backward compatibility with existing DEEPSEEK_* keys while treating this as a generic backup model.
  const apiKey = (process.env.DEEPSEEK_API_KEY || "").trim();
  if (!apiKey) return null;

  const baseURL = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").trim();
  const model = (process.env.DEEPSEEK_MODEL_NAME || primaryModel || "deepseek-reasoner").trim();

  return {
    apiKey,
    baseURL: baseURL || undefined,
    model,
  };
}

export function resolveRedTeamDefaultModel(primaryModel = getPrimaryModel()): string {
  const redTeamFromPool = getLLMPool().getClient({ tags: ["red-team"] });
  if (redTeamFromPool?.model) {
    return redTeamFromPool.model;
  }

  const backup = getBackupEnvConfig(primaryModel);
  if (backup?.model) {
    return backup.model;
  }

  return primaryModel;
}

export function resolveRedTeamRuntime(primaryModel = getPrimaryModel()): RedTeamRuntimeConfig {
  const redTeamFromPool = getLLMPool().getClient({ tags: ["red-team"] });
  if (redTeamFromPool) {
    return {
      model: redTeamFromPool.model || primaryModel,
      source: "pool",
      label: redTeamFromPool.accountName || "备用LLM账户池",
      poolTags: ["red-team"],
      accountId: redTeamFromPool.accountId,
      accountName: redTeamFromPool.accountName,
    };
  }

  const backup = getBackupEnvConfig(primaryModel);
  if (backup) {
    return {
      model: backup.model,
      source: "backup-env",
      label: "备用LLM模型（环境变量）",
      client: new OpenAI({
        apiKey: backup.apiKey,
        ...(backup.baseURL ? { baseURL: backup.baseURL } : {}),
      }),
      accountId: "__red_team_backup_env__",
      accountName: "备用LLM模型（环境变量）",
    };
  }

  return {
    model: primaryModel,
    source: "primary",
    label: "主模型",
  };
}

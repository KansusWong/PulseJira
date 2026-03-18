"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import clsx from "clsx";
import { useTranslation } from "@/lib/i18n";
import {
  Layers,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  ChevronDown,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Power,
  PowerOff,
  Import,
  Save,
  Wallet,
  RefreshCw,
  Activity,
  History,
  Clock3,
} from "lucide-react";
import { NumberStepper } from "@/components/ui/NumberStepper";

// ---------------------------------------------------------------------------
// Types (mirroring API response)
// ---------------------------------------------------------------------------

interface MaskedAccount {
  id: string;
  name: string;
  provider: string;
  maskedApiKey: string;
  baseURL?: string;
  defaultModel?: string;
  modelMapping?: Record<string, string>;
  enabled: boolean;
  priority: number;
  tags?: string[];
  source: "user" | "env-import";
  createdAt: string;
}

type Strategy = "priority" | "round-robin";

interface PoolData {
  strategy: Strategy;
  accounts: MaskedAccount[];
  unimportedEnv: MaskedAccount[];
  runtimeConfig: RuntimeConfig;
  health: AccountHealth[];
  recentFailoverEvents: FailoverEvent[];
}

interface HealthPanelData {
  runtimeConfig: RuntimeConfig;
  health: AccountHealth[];
  recentFailoverEvents: FailoverEvent[];
}

interface BalanceInfo {
  accountId: string;
  supported: boolean;
  balance: string | null;
  currency: string | null;
  tokenBalance: string | null;
  tokenCurrency: string | null;
  cashBalance: string | null;
  cashCurrency: string | null;
  isAvailable: boolean | null;
  grantedBalance: string | null;
  toppedUpBalance: string | null;
  localUsage: { totalTokens: number; totalCalls: number } | null;
  error: string | null;
}

interface RuntimeConfig {
  failureThreshold: number;
  cooldownMs: number;
  failoverPolicy: {
    failoverOnTimeout: boolean;
    failoverOnServerError: boolean;
    failoverOnModelNotFound: boolean;
  };
}

type HealthStatus = "healthy" | "cooldown" | "disabled";

interface AccountHealth {
  accountId: string;
  accountName: string;
  enabled: boolean;
  status: HealthStatus;
  consecutiveFailures: number;
  inCooldown: boolean;
  cooldownUntil: string | null;
  cooldownRemainingMs: number;
  lastError: string | null;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
}

interface FailoverEvent {
  id: string;
  eventType: "switch" | "exhausted";
  fromAccountId: string | null;
  fromAccountName: string | null;
  toAccountId: string | null;
  toAccountName: string | null;
  reason: string | null;
  errorStatus: number | null;
  errorCode: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Provider badge
// ---------------------------------------------------------------------------

const PROVIDER_COLORS: Record<string, string> = {
  openai: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  glm: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  deepseek: "bg-violet-500/15 text-violet-400 border-violet-500/20",
  custom: "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-default)]",
};

function ProviderBadge({ provider }: { provider: string }) {
  const color = PROVIDER_COLORS[provider] || PROVIDER_COLORS.custom;
  return (
    <span className={clsx("text-[10px] font-mono px-2 py-0.5 rounded-full border", color)}>
      {provider}
    </span>
  );
}

function formatTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}b`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}m`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: "¥",
  USD: "$",
  EUR: "€",
};

const BALANCE_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const HEALTH_REFRESH_INTERVAL_MS = 60 * 1000;
const ENABLE_DEV_POLLING = process.env.NEXT_PUBLIC_ENABLE_LLM_POOL_DEV_POLLING === "true";
const SHOULD_AUTO_POLL = process.env.NODE_ENV === "production" || ENABLE_DEV_POLLING;

function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hour = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hour}h ${remMin}m` : `${hour}h`;
}

function formatRelativeTime(iso: string | null, justNow = "just now", ago = "ago"): string {
  if (!iso) return "—";
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "—";
  const diff = Date.now() - ts;
  if (diff < 0) return justNow;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ${ago}`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${ago}`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}h ${ago}`;
  const day = Math.floor(hour / 24);
  return `${day}d ${ago}`;
}

function toModelTitle(account: MaskedAccount, noModelLabel = "No model set"): string {
  const model = String(account.defaultModel || "").trim();
  if (model) return model;
  const fallback = String(account.name || "").trim();
  return fallback || noModelLabel;
}

function buildAccountTitleById(accounts: MaskedAccount[], noModelLabel?: string): Map<string, string> {
  type Indexed = { account: MaskedAccount; index: number; title: string; key: string };
  const groups = new Map<string, Indexed[]>();

  accounts.forEach((account, index) => {
    const title = toModelTitle(account, noModelLabel);
    const key = title.toLowerCase();
    const list = groups.get(key) || [];
    list.push({ account, index, title, key });
    groups.set(key, list);
  });

  const out = new Map<string, string>();
  for (const list of groups.values()) {
    if (list.length === 1) {
      const only = list[0];
      out.set(only.account.id, only.title);
      continue;
    }

    list.sort((a, b) => {
      const ta = Date.parse(a.account.createdAt || "");
      const tb = Date.parse(b.account.createdAt || "");
      const aValid = Number.isFinite(ta);
      const bValid = Number.isFinite(tb);
      if (aValid && bValid && ta !== tb) return ta - tb;
      if (aValid !== bValid) return aValid ? -1 : 1;
      return a.index - b.index;
    });

    list.forEach((item, idx) => {
      const suffix = String(idx + 1).padStart(2, "0");
      out.set(item.account.id, `${item.title} (${suffix})`);
    });
  }

  return out;
}

function parseModelMappingInput(raw: string, errors?: { invalid: string; parseFailed: string }): { mapping: Record<string, string> | undefined; error: string | null } {
  const text = raw.trim();
  if (!text) return { mapping: undefined, error: null };

  const invalidMsg = errors?.invalid ?? "Model mapping must be a JSON object";
  const parseFailedMsg = errors?.parseFailed ?? "Failed to parse model mapping JSON";

  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { mapping: undefined, error: invalidMsg };
    }

    const mapping: Record<string, string> = {};
    for (const [source, target] of Object.entries(parsed as Record<string, unknown>)) {
      const from = String(source || "").trim();
      const to = String(target || "").trim();
      if (!from || !to) continue;
      mapping[from] = to;
    }

    return {
      mapping: Object.keys(mapping).length > 0 ? mapping : undefined,
      error: null,
    };
  } catch {
    return { mapping: undefined, error: parseFailedMsg };
  }
}

// ---------------------------------------------------------------------------
// Account card
// ---------------------------------------------------------------------------

function AccountCard({
  account,
  title,
  balance,
  health,
  onToggle,
  onDelete,
  onPriorityChange,
}: {
  account: MaskedAccount;
  title: string;
  balance?: BalanceInfo;
  health?: AccountHealth;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onPriorityChange: (id: string, priority: number) => void;
}) {
  const { t } = useTranslation();
  const status: HealthStatus = health?.status || (account.enabled ? "healthy" : "disabled");
  const statusLabel =
    status === "healthy" ? t('llm.statusHealthy') : status === "cooldown" ? t('llm.statusCooldown') : t('llm.statusDisabled');
  const isGlm = account.provider === "glm";

  const cashBalanceDisplay =
    balance?.cashBalance ?? (balance?.currency !== "TOKENS" ? balance?.balance ?? null : null);
  const cashCurrencyDisplay =
    balance?.cashCurrency ?? (balance?.currency !== "TOKENS" ? balance?.currency ?? null : null);
  const fallbackBalanceDisplay = balance?.balance ?? null;
  const fallbackCurrencyDisplay = balance?.currency ?? null;
  const unifiedBalanceDisplay = cashBalanceDisplay ?? fallbackBalanceDisplay;
  const unifiedBalanceCurrency = cashBalanceDisplay !== null ? cashCurrencyDisplay : fallbackCurrencyDisplay;
  const unifiedBalanceIsToken = unifiedBalanceCurrency === "TOKENS";
  const displayCurrency =
    cashCurrencyDisplay ||
    (balance?.currency && balance.currency !== "TOKENS" ? balance.currency : null) ||
    null;
  const hasAnyRemoteBalance = unifiedBalanceDisplay !== null;

  return (
    <div
      className={clsx(
        "rounded-lg border p-4 transition-colors",
        account.enabled
          ? "bg-[var(--bg-glass)] border-[var(--border-subtle)]"
          : "bg-[var(--bg-glass)] border-[var(--border-subtle)] opacity-60"
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={clsx(
              "w-2 h-2 rounded-full shrink-0",
              status === "healthy"
                ? "bg-emerald-500"
                : status === "cooldown"
                  ? "bg-amber-400"
                  : "bg-[var(--bg-elevated)]"
            )}
          />
          <span className="text-sm font-medium text-[var(--text-primary)] truncate">
            {title}
          </span>
          <ProviderBadge provider={account.provider} />
          {account.source === "env-import" && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              ENV
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onToggle(account.id, !account.enabled)}
            className={clsx(
              "p-1.5 rounded-md transition-colors",
              account.enabled
                ? "text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                : "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
            )}
            title={account.enabled ? t('common.enabled') : t('common.disabled')}
          >
            {account.enabled ? (
              <Power className="w-3.5 h-3.5" />
            ) : (
              <PowerOff className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={() => onDelete(account.id)}
            className="p-1.5 rounded-md text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
            title={t('common.delete')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-1.5 text-xs">
        <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
          <span className="text-[var(--text-muted)]">{t('llm.status')}</span>
          <div className="min-w-0 flex justify-end">
            <span
              className={clsx(
                "text-[10px] px-2 py-0.5 rounded-full border font-medium",
                status === "healthy"
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                  : status === "cooldown"
                    ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                    : "bg-[var(--bg-elevated)]/40 text-[var(--text-secondary)] border-[var(--border-default)]"
              )}
            >
              {statusLabel}
            </span>
          </div>
        </div>
        {health?.inCooldown && (
          <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
            <span className="text-[var(--text-muted)]">{t('llm.remainingCooldown')}</span>
            <span className="text-amber-300 font-mono truncate text-right">
              {formatDuration(health.cooldownRemainingMs)}
            </span>
          </div>
        )}
        <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
          <span className="text-[var(--text-muted)]">API Key</span>
          <span className="text-[var(--text-secondary)] font-mono truncate text-right" title={account.maskedApiKey}>
            {account.maskedApiKey}
          </span>
        </div>
        {account.baseURL && (
          <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
            <span className="text-[var(--text-muted)]">Base URL</span>
            <span className="text-[var(--text-secondary)] font-mono truncate text-right" title={account.baseURL}>
              {account.baseURL}
            </span>
          </div>
        )}
        {account.modelMapping && Object.keys(account.modelMapping).length > 0 && (
          <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
            <span className="text-[var(--text-muted)]">{t('llm.mapping')}</span>
            <span className="text-[var(--text-secondary)] font-mono text-right truncate">
              {t('llm.mappingCount', { count: Object.keys(account.modelMapping).length })}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-[var(--text-muted)]">Priority</span>
          <NumberStepper
            value={account.priority}
            min={0}
            max={100}
            onChange={(next) => onPriorityChange(account.id, next)}
            valueClassName="min-w-[28px]"
          />
        </div>
        {account.tags && account.tags.length > 0 && (
          <div className="flex items-center gap-1 pt-1">
            {account.tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Balance / Usage section */}
      <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
        {balance ? (
          <div className="space-y-1.5">
            {balance.supported && hasAnyRemoteBalance ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                    <Wallet className="w-3 h-3" />
                    {t('llm.balance')}
                  </span>
                  <span
                    className={clsx(
                      "text-sm font-semibold font-mono",
                      balance.isAvailable === false ? "text-red-400" : "text-emerald-400"
                    )}
                  >
                    {unifiedBalanceIsToken
                      ? `${unifiedBalanceDisplay} tokens`
                      : `${CURRENCY_SYMBOLS[unifiedBalanceCurrency || ""] || ""}${unifiedBalanceDisplay}${CURRENCY_SYMBOLS[unifiedBalanceCurrency || ""] ? "" : unifiedBalanceCurrency ? ` ${unifiedBalanceCurrency}` : ""}`}
                  </span>
                </div>
              </div>
            ) : balance.supported && balance.error ? (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                  <Wallet className="w-3 h-3" />
                  {t('llm.balance')}
                </span>
                <span className="text-[10px] text-red-400/70">
                  {balance.error.includes("未配置")
                    ? t('llm.balanceNotConfigured')
                    : t('llm.balanceQueryFailed', { error: balance.error.slice(0, 80) })}
                </span>
              </div>
            ) : !balance.supported ? (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                  <Wallet className="w-3 h-3" />
                  {t('llm.balance')}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  {isGlm ? t('llm.balanceRemoteNotConfigured') : t('llm.balanceNotSupported')}
                </span>
              </div>
            ) : null}

            {balance.supported && balance.grantedBalance && balance.toppedUpBalance && (
              <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                <span>{t('llm.grantedBalance')} {CURRENCY_SYMBOLS[displayCurrency || ""] || ""}{balance.grantedBalance}</span>
                <span>{t('llm.toppedUpBalance')} {CURRENCY_SYMBOLS[displayCurrency || ""] || ""}{balance.toppedUpBalance}</span>
              </div>
            )}

            {balance.localUsage && (balance.localUsage.totalTokens > 0 || balance.localUsage.totalCalls > 0) && (
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-[var(--text-muted)]">{t('llm.localStats')}</span>
                <span className="text-[var(--text-secondary)] font-mono">
                  {t('llm.localStatsValue', { tokens: formatTokens(balance.localUsage.totalTokens), calls: balance.localUsage.totalCalls })}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
              <Wallet className="w-3 h-3" />
              {t('llm.balance')}
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">{t('llm.balanceClickRefresh')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add account form
// ---------------------------------------------------------------------------

interface NewAccountForm {
  name: string;
  provider: string;
  apiKey: string;
  baseURL: string;
  defaultModel: string;
  modelMapping: string;
  priority: number;
  tags: string;
}

const EMPTY_FORM: NewAccountForm = {
  name: "",
  provider: "openai",
  apiKey: "",
  baseURL: "",
  defaultModel: "",
  modelMapping: "",
  priority: 10,
  tags: "",
};

function AddAccountForm({
  onAdd,
  saving,
  expanded,
}: {
  onAdd: (form: NewAccountForm) => Promise<boolean>;
  saving: boolean;
  expanded: boolean;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<NewAccountForm>(EMPTY_FORM);
  const [showKey, setShowKey] = useState(false);

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.apiKey.trim()) return;
    const ok = await onAdd(form);
    if (ok) {
      setForm(EMPTY_FORM);
      setShowKey(false);
    }
  };

  return (
    <div
      className={clsx(
        "rounded-lg bg-[var(--bg-glass)] transition-colors",
        expanded ? "border border-dashed border-[var(--border-subtle)]" : "border-0"
      )}
    >
      <div
        className={clsx(
          "overflow-hidden transition-all duration-300 ease-out",
          expanded ? "max-h-[960px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="px-4 pb-4 space-y-3 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-[var(--text-muted)] font-medium">{t('llm.nameRequired')}</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t('llm.namePlaceholder')}
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-accent)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-[var(--text-muted)] font-medium">Provider</label>
              <select
                value={form.provider}
                onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-accent)]"
              >
                <option value="openai">OpenAI</option>
                <option value="glm">{t('llm.providerGlm')}</option>
                <option value="deepseek">DeepSeek</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-[var(--text-muted)] font-medium">API Key *</label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={form.apiKey}
                onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                placeholder="sk-..."
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-mono focus:outline-none focus:border-[var(--border-accent)]"
              />
              <button
                type="button"
                onClick={() => setShowKey((p) => !p)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-[var(--text-muted)] font-medium">Base URL</label>
              <input
                value={form.baseURL}
                onChange={(e) => setForm((f) => ({ ...f, baseURL: e.target.value }))}
                placeholder="https://api.openai.com/v1/"
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-mono focus:outline-none focus:border-[var(--border-accent)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-[var(--text-muted)] font-medium">{t('llm.defaultModel')}</label>
              <input
                value={form.defaultModel}
                onChange={(e) => setForm((f) => ({ ...f, defaultModel: e.target.value }))}
                placeholder="gpt-4o"
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-mono focus:outline-none focus:border-[var(--border-accent)]"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-[var(--text-muted)] font-medium">
              {t('llm.modelMapping')}
            </label>
            <textarea
              value={form.modelMapping}
              onChange={(e) => setForm((f) => ({ ...f, modelMapping: e.target.value }))}
              rows={2}
              placeholder='{"gpt-4o":"moonshot-v1-8k","gpt-4.1":"moonshot-v1-32k"}'
              className="w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-mono focus:outline-none focus:border-[var(--border-accent)]"
            />
            <p className="text-[10px] text-[var(--text-muted)]">
              {t('llm.modelMappingHint')}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-[var(--text-muted)] font-medium">{t('llm.priorityHint')}</label>
              <NumberStepper
                value={form.priority}
                min={0}
                max={100}
                onChange={(priority) => setForm((f) => ({ ...f, priority }))}
                className="w-full"
                valueClassName="flex-1"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-[var(--text-muted)] font-medium">{t('llm.tagsLabel')}</label>
              <input
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                placeholder="compression, fast"
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-accent)]"
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              onClick={handleSubmit}
              disabled={!form.name.trim() || !form.apiKey.trim() || saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-white text-black hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? t('llm.savingAccount') : t('llm.addAccountBtn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LLMPoolCard() {
  const { t } = useTranslation();
  const [data, setData] = useState<PoolData | null>(null);
  const [loading, setLoading] = useState(true);
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runtimeSaving, setRuntimeSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [balances, setBalances] = useState<Record<string, BalanceInfo>>({});
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [runtimeDraft, setRuntimeDraft] = useState<RuntimeConfig | null>(null);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const noModelLabel = t('llm.noModel');
  const accountTitleById = useMemo(
    () => buildAccountTitleById(data?.accounts || [], noModelLabel),
    [data?.accounts, noModelLabel]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/llm-pool");
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        if (json.data?.runtimeConfig) {
          setRuntimeDraft((prev) => prev || json.data.runtimeConfig);
        }
        setError(null);
      } else {
        setError(json.error || t('llm.loadFailed'));
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHealthPanel = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/llm-pool/health");
      const json = await res.json();
      if (!json.success || !json.data) return;

      const payload = json.data as Partial<HealthPanelData>;
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          runtimeConfig: payload.runtimeConfig || prev.runtimeConfig,
          health: Array.isArray(payload.health) ? payload.health : prev.health,
          recentFailoverEvents: Array.isArray(payload.recentFailoverEvents)
            ? payload.recentFailoverEvents
            : prev.recentFailoverEvents,
        };
      });
    } catch {}
  }, []);

  const fetchBalances = useCallback(async () => {
    setBalanceLoading(true);
    try {
      const res = await fetch("/api/settings/llm-pool/balance");
      const json = await res.json();
      if (json.success && json.data?.balances) {
        const map: Record<string, BalanceInfo> = {};
        for (const b of json.data.balances) {
          map[b.accountId] = b;
        }
        setBalances(map);
      }
    } catch {}
    setBalanceLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const onVisibilityChange = () => {
      setIsPageVisible(document.visibilityState === "visible");
    };
    onVisibilityChange();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    if (!SHOULD_AUTO_POLL || !isPageVisible) return;
    const timer = setInterval(() => {
      fetchHealthPanel();
    }, HEALTH_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchHealthPanel, isPageVisible]);

  // Auto-fetch balances once pool data loads with accounts
  useEffect(() => {
    const accountCount = data?.accounts.length ?? 0;
    if (accountCount > 0) {
      fetchBalances();
    }
  }, [data?.accounts.length, fetchBalances]);

  // Auto-refresh balances every 30 minutes.
  useEffect(() => {
    const accountCount = data?.accounts.length ?? 0;
    if (accountCount === 0 || !SHOULD_AUTO_POLL || !isPageVisible) return;
    const timer = setInterval(() => {
      fetchBalances();
    }, BALANCE_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [data?.accounts.length, fetchBalances, isPageVisible]);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 2000);
  };

  const handleRefreshPanel = async () => {
    if (data) {
      await fetchHealthPanel();
    } else {
      await fetchData();
    }
    await fetchBalances();
  };

  const handleRuntimeConfigSave = async () => {
    if (!runtimeDraft) return;
    const threshold = Math.floor(Number(runtimeDraft.failureThreshold));
    const cooldown = Math.floor(Number(runtimeDraft.cooldownMs));
    const failoverPolicy = runtimeDraft.failoverPolicy || data?.runtimeConfig.failoverPolicy || {
      failoverOnTimeout: true,
      failoverOnServerError: true,
      failoverOnModelNotFound: true,
    };
    if (!Number.isFinite(threshold) || threshold <= 0) {
      setError(t('llm.failureThresholdError'));
      return;
    }
    if (!Number.isFinite(cooldown) || cooldown <= 0) {
      setError(t('llm.cooldownError'));
      return;
    }

    setRuntimeSaving(true);
    try {
      const res = await fetch("/api/settings/llm-pool", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runtimeConfig: {
            failureThreshold: threshold,
            cooldownMs: cooldown,
            failoverPolicy: {
              failoverOnTimeout: !!failoverPolicy.failoverOnTimeout,
              failoverOnServerError: !!failoverPolicy.failoverOnServerError,
              failoverOnModelNotFound: !!failoverPolicy.failoverOnModelNotFound,
            },
          },
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || t('llm.runtimeConfigFailed'));
        return;
      }
      await fetchData();
      showSuccess(t('llm.runtimeConfigUpdated'));
    } catch (e: any) {
      setError(e.message || t('llm.runtimeConfigFailed'));
    } finally {
      setRuntimeSaving(false);
    }
  };

  // Strategy change
  const handleStrategyChange = async (strategy: Strategy) => {
    try {
      await fetch("/api/settings/llm-pool", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy }),
      });
      await fetchData();
      showSuccess(t('llm.strategyUpdated'));
    } catch {}
  };

  // Toggle enabled
  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await fetch("/api/settings/llm-pool", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: id, enabled }),
      });
      await fetchData();
    } catch {}
  };

  // Delete
  const handleDelete = async (id: string) => {
    if (!confirm(t('llm.confirmDeleteAccount'))) return;
    try {
      await fetch(`/api/settings/llm-pool?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      await fetchData();
      showSuccess(t('llm.deleted'));
    } catch {}
  };

  // Priority change
  const handlePriorityChange = async (id: string, priority: number) => {
    try {
      await fetch("/api/settings/llm-pool", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: id, priority }),
      });
      await fetchData();
    } catch {}
  };

  // Add account
  const handleAdd = async (form: NewAccountForm): Promise<boolean> => {
    setSaving(true);
    try {
      if (form.provider === "custom" && !form.baseURL.trim()) {
        setError(t('llm.customProviderBaseUrl'));
        return false;
      }

      const parsedMapping = parseModelMappingInput(form.modelMapping, {
        invalid: t('llm.modelMappingInvalid'),
        parseFailed: t('llm.modelMappingParseFailed'),
      });
      if (parsedMapping.error) {
        setError(parsedMapping.error);
        return false;
      }

      const tags = form.tags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/settings/llm-pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account: {
            id: `user-${Date.now()}`,
            name: form.name,
            provider: form.provider,
            apiKey: form.apiKey,
            baseURL: form.baseURL || undefined,
            defaultModel: form.defaultModel || undefined,
            modelMapping: parsedMapping.mapping,
            priority: form.priority,
            tags,
            source: "user",
          },
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || t('llm.accountAddFailed'));
        return false;
      }
      await fetchData();
      const detectedModel = json.data?.detectedDefaultModel;
      const probeWarning = typeof json.data?.probeWarning === "string" ? json.data.probeWarning : "";
      const apiKeyEnvVarName = typeof json.data?.apiKeyEnvVarName === "string" ? json.data.apiKeyEnvVarName : "";
      const successText =
        detectedModel
          ? t('llm.accountAddedModel', { model: detectedModel })
          : probeWarning
            ? t('llm.accountAddedPending')
            : t('llm.accountAdded');
      showSuccess(
        apiKeyEnvVarName ? t('llm.accountAddedKeyStored', { text: successText, envVar: apiKeyEnvVarName }) : successText
      );
      setError(probeWarning ? t('llm.accountSavedProbeWarning', { warning: probeWarning }) : null);
      return true;
    } catch (e: any) {
      setError(e?.message || t('llm.accountAddFailed'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Import env account
  const handleImportEnv = async (account: MaskedAccount) => {
    setSaving(true);
    try {
      await fetch("/api/settings/llm-pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account: {
            ...account,
            // The API will need the actual apiKey, which it already has from env-importer.
            // We signal import by passing the id; the server will resolve the actual key.
            apiKey: "__import_from_env__",
          },
        }),
      });
      await fetchData();
      showSuccess(t('llm.imported', { name: account.name }));
    } catch {} finally {
      setSaving(false);
    }
  };

  const healthByAccountId = new Map((data?.health || []).map((h) => [h.accountId, h]));
  const accountIdSet = new Set((data?.accounts || []).map((a) => a.id));
  const visibleHealth = (data?.health || []).filter((h) => accountIdSet.has(h.accountId));
  const healthSummary = visibleHealth.reduce(
    (acc, h) => {
      if (h.status === "healthy") acc.healthy += 1;
      if (h.status === "cooldown") acc.cooldown += 1;
      if (h.status === "disabled") acc.disabled += 1;
      return acc;
    },
    { healthy: 0, cooldown: 0, disabled: 0 }
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Layers className="w-6 h-6 text-violet-400" />
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">{t('llm.title')}</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {t('llm.description')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {successMsg && (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {successMsg}
            </span>
          )}
          {error && (
            <span className="flex items-center gap-1 text-xs text-red-400">
              <AlertCircle className="w-3.5 h-3.5" />
              {error}
            </span>
          )}
          <button
            onClick={handleRefreshPanel}
            disabled={loading || balanceLoading || !data?.accounts.length}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={t('llm.refreshTitle')}
          >
            {balanceLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {balanceLoading ? t('llm.refreshing') : t('llm.refreshStatus')}
          </button>
          <button
            onClick={() => setAddFormOpen((p) => !p)}
            disabled={loading || !data}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {addFormOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {addFormOpen ? t('llm.collapseForm') : t('llm.addAccount')}
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--text-muted)]" />
        </div>
      ) : data ? (
        <>
          {/* Strategy selector */}
          <div className="bg-[var(--bg-glass)] border border-[var(--border-subtle)] rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1">
                  {t('llm.routeStrategy')}
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  {data.strategy === "priority"
                    ? t('llm.strategyPriority')
                    : t('llm.strategyRoundRobin')}
                </p>
              </div>
              <div className="flex rounded-lg overflow-hidden border border-[var(--border-subtle)]">
                <button
                  onClick={() => handleStrategyChange("priority")}
                  className={clsx(
                    "px-3 py-1.5 text-xs font-medium transition-colors",
                    data.strategy === "priority"
                      ? "bg-violet-500/20 text-violet-300"
                      : "bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  )}
                >
                  {t('llm.priority')}
                </button>
                <button
                  onClick={() => handleStrategyChange("round-robin")}
                  className={clsx(
                    "px-3 py-1.5 text-xs font-medium transition-colors",
                    data.strategy === "round-robin"
                      ? "bg-violet-500/20 text-violet-300"
                      : "bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  )}
                >
                  {t('llm.roundRobin')}
                </button>
              </div>
            </div>
          </div>

          {/* Runtime config + health + recent switches */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="bg-[var(--bg-glass)] border border-[var(--border-subtle)] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Runtime Config
                </div>
                <Clock3 className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-[var(--text-muted)] font-medium">
                    Failures to Cooldown
                  </label>
                  <NumberStepper
                    value={runtimeDraft?.failureThreshold ?? data.runtimeConfig.failureThreshold}
                    min={1}
                    onChange={(failureThreshold) =>
                      setRuntimeDraft((prev) => ({
                        ...(prev || data.runtimeConfig),
                        failureThreshold,
                      }))
                    }
                    className="w-full"
                    valueClassName="flex-1"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-[var(--text-muted)] font-medium">Cooldown (ms)</label>
                  <NumberStepper
                    value={runtimeDraft?.cooldownMs ?? data.runtimeConfig.cooldownMs}
                    min={1000}
                    step={1000}
                    onChange={(cooldownMs) =>
                      setRuntimeDraft((prev) => ({
                        ...(prev || data.runtimeConfig),
                        cooldownMs,
                      }))
                    }
                    className="w-full"
                    valueClassName="flex-1"
                  />
                </div>
              </div>
              <div className="mt-3 space-y-2">
                <div className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Failover Policy
                </div>
                <label className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-glass)] px-2.5 py-2 text-xs">
                  <span className="text-[var(--text-primary)]">{t('llm.failoverTimeout')}</span>
                  <input
                    type="checkbox"
                    checked={runtimeDraft?.failoverPolicy?.failoverOnTimeout ?? data.runtimeConfig.failoverPolicy.failoverOnTimeout}
                    onChange={(e) =>
                      setRuntimeDraft((prev) => ({
                        ...(prev || data.runtimeConfig),
                        failoverPolicy: {
                          ...((prev || data.runtimeConfig).failoverPolicy || data.runtimeConfig.failoverPolicy),
                          failoverOnTimeout: e.target.checked,
                        },
                      }))
                    }
                    className="h-3.5 w-3.5 accent-violet-400"
                  />
                </label>
                <label className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-glass)] px-2.5 py-2 text-xs">
                  <span className="text-[var(--text-primary)]">{t('llm.failover5xx')}</span>
                  <input
                    type="checkbox"
                    checked={runtimeDraft?.failoverPolicy?.failoverOnServerError ?? data.runtimeConfig.failoverPolicy.failoverOnServerError}
                    onChange={(e) =>
                      setRuntimeDraft((prev) => ({
                        ...(prev || data.runtimeConfig),
                        failoverPolicy: {
                          ...((prev || data.runtimeConfig).failoverPolicy || data.runtimeConfig.failoverPolicy),
                          failoverOnServerError: e.target.checked,
                        },
                      }))
                    }
                    className="h-3.5 w-3.5 accent-violet-400"
                  />
                </label>
                <label className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-glass)] px-2.5 py-2 text-xs">
                  <span className="text-[var(--text-primary)]">{t('llm.failoverModelNotFound')}</span>
                  <input
                    type="checkbox"
                    checked={runtimeDraft?.failoverPolicy?.failoverOnModelNotFound ?? data.runtimeConfig.failoverPolicy.failoverOnModelNotFound}
                    onChange={(e) =>
                      setRuntimeDraft((prev) => ({
                        ...(prev || data.runtimeConfig),
                        failoverPolicy: {
                          ...((prev || data.runtimeConfig).failoverPolicy || data.runtimeConfig.failoverPolicy),
                          failoverOnModelNotFound: e.target.checked,
                        },
                      }))
                    }
                    className="h-3.5 w-3.5 accent-violet-400"
                  />
                </label>
              </div>
              <div className="flex justify-end mt-3">
                <button
                  onClick={handleRuntimeConfigSave}
                  disabled={runtimeSaving}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-white text-black hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {runtimeSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  {runtimeSaving ? t('common.saving') : t('llm.saveRuntimeParams')}
                </button>
              </div>
            </div>

            <div className="bg-[var(--bg-glass)] border border-[var(--border-subtle)] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Pool Health
                </div>
                <Activity className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1.5 text-center">
                  <div className="text-lg text-emerald-300 font-semibold">{healthSummary.healthy}</div>
                  <div className="text-[10px] text-emerald-400/80">Healthy</div>
                </div>
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-1.5 text-center">
                  <div className="text-lg text-amber-300 font-semibold">{healthSummary.cooldown}</div>
                  <div className="text-[10px] text-amber-400/80">Cooldown</div>
                </div>
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1.5 text-center">
                  <div className="text-lg text-[var(--text-primary)] font-semibold">{healthSummary.disabled}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">Disabled</div>
                </div>
              </div>
              <div className="space-y-1.5 max-h-[176px] overflow-auto pr-1">
                {visibleHealth.length > 0 ? (
                  visibleHealth.map((h) => (
                    <div
                      key={h.accountId}
                      className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-glass)] px-2.5 py-2 text-xs"
                    >
                      <span className="text-[var(--text-primary)] truncate pr-3">{h.accountName}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {h.status === "cooldown" && (
                          <span className="text-amber-300 font-mono">
                            {formatDuration(h.cooldownRemainingMs)}
                          </span>
                        )}
                        <span
                          className={clsx(
                            "px-2 py-0.5 rounded-full border text-[10px]",
                            h.status === "healthy"
                              ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                              : h.status === "cooldown"
                                ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                                : "bg-[var(--bg-elevated)]/40 text-[var(--text-secondary)] border-[var(--border-default)]"
                          )}
                        >
                          {h.status}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-[var(--text-muted)]">{t('llm.noHealthData')}</div>
                )}
              </div>
            </div>

            {/* Recent failover events */}
            <div className="bg-[var(--bg-glass)] border border-[var(--border-subtle)] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Recent Switches
                </div>
                <History className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              </div>
              <div className="space-y-2 max-h-[220px] overflow-auto pr-1">
                {data.recentFailoverEvents.length > 0 ? (
                  data.recentFailoverEvents.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-glass)] px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-[var(--text-primary)] truncate">
                          {event.eventType === "switch"
                            ? `${event.fromAccountName || event.fromAccountId || "unknown"} → ${event.toAccountName || event.toAccountId || "unknown"}`
                            : `${event.fromAccountName || event.fromAccountId || "unknown"} exhausted`}
                        </div>
                        <span
                          className={clsx(
                            "shrink-0 text-[10px] px-2 py-0.5 rounded-full border",
                            event.eventType === "switch"
                              ? "bg-blue-500/10 text-blue-300 border-blue-500/30"
                              : "bg-amber-500/10 text-amber-300 border-amber-500/30"
                          )}
                        >
                          {event.eventType}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                        <span className="truncate pr-2">{event.reason || "no reason"}</span>
                        <span title={event.createdAt}>{formatRelativeTime(event.createdAt, t('common.justNow'), t('common.ago'))}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-[var(--text-muted)]">{t('llm.noSwitchEvents')}</div>
                )}
              </div>
            </div>
          </div>

          {/* Unimported env accounts */}
          {data.unimportedEnv.length > 0 && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Import className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-medium text-amber-300">
                  {t('llm.envAccountsDetected')}
                </span>
              </div>
              <div className="space-y-2">
                {data.unimportedEnv.map((env) => (
                  <div
                    key={env.id}
                    className="flex items-center justify-between bg-[var(--bg-glass)] rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-[var(--text-primary)]">{env.name}</span>
                      <ProviderBadge provider={env.provider} />
                      <span className="text-xs text-[var(--text-muted)] font-mono">{env.maskedApiKey}</span>
                    </div>
                    <button
                      onClick={() => handleImportEnv(env)}
                      disabled={saving}
                      className="text-xs px-3 py-1 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                    >
                      {t('common.import')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Account list */}
          {data.accounts.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-muted)] text-sm border border-dashed border-[var(--border-subtle)] rounded-xl">
              {t('llm.noAccounts')}
            </div>
          ) : (
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}
            >
              {data.accounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  title={accountTitleById.get(account.id) || toModelTitle(account, noModelLabel)}
                  balance={balances[account.id]}
                  health={healthByAccountId.get(account.id)}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onPriorityChange={handlePriorityChange}
                />
              ))}
            </div>
          )}

          {/* Add account form */}
          <AddAccountForm onAdd={handleAdd} saving={saving} expanded={addFormOpen} />
        </>
      ) : (
        <div className="text-center py-12 text-[var(--text-muted)] text-sm">
          {t('llm.loadPoolFailed')}
        </div>
      )}
    </div>
  );
}

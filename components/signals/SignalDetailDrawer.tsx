"use client";

import { useState } from "react";
import { useTranslation } from "@/lib/i18n";
import {
  X,
  ExternalLink,
  MessageSquarePlus,
  ThumbsDown,
  Loader2,
  TrendingUp,
  Users,
  Scale,
  Shield,
  ShieldAlert,
  Gavel,
  Search,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  BarChart3,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Rocket,
} from "lucide-react";
import clsx from "clsx";
import type { Signal } from "./SignalCard";

interface SignalDetailDrawerProps {
  signal: Signal;
  isDiscussing?: boolean;
  onClose: () => void;
  onQuickDiscuss: (signalId: string) => Promise<void>;
  onReject: (signalId: string) => Promise<void>;
  onRestore?: (signalId: string) => Promise<void>;
  onExecute?: (signalId: string) => Promise<void>;
}

const platformColors: Record<string, string> = {
  reddit: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  twitter: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  youtube: "bg-red-500/10 text-red-400 border-red-500/20",
};

const platformIcons: Record<string, string> = {
  reddit: "\u{1F4AC}",
  twitter: "\u{1F426}",
  youtube: "\u{1F4F9}",
};

function Section({
  icon,
  title,
  children,
  defaultOpen = true,
  color = "text-zinc-400",
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  color?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-zinc-800/60 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-bold hover:bg-zinc-800/30 transition-colors"
      >
        <span className={color}>{icon}</span>
        <span className="text-zinc-300">{title}</span>
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 ml-auto text-zinc-600" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 ml-auto text-zinc-600" />
        )}
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className="text-xs text-zinc-300 leading-relaxed">{children}</div>
    </div>
  );
}

function ScoreBadge({ score, label }: { score: number; label: string }) {
  return (
    <div className="flex items-center gap-3 bg-zinc-900 rounded-lg px-3 py-2">
      <div className="relative w-10 h-10">
        <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="currentColor"
            className="text-zinc-800"
            strokeWidth="3"
          />
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="currentColor"
            className={
              score >= 70
                ? "text-emerald-400"
                : score >= 50
                  ? "text-yellow-400"
                  : "text-red-400"
            }
            strokeWidth="3"
            strokeDasharray={`${score}, 100`}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-zinc-200">
          {score}
        </span>
      </div>
      <div>
        <div className="text-xs font-bold text-zinc-200">{label}</div>
        <div className="text-[10px] text-zinc-500">/ 100</div>
      </div>
    </div>
  );
}

export function SignalDetailDrawer({
  signal,
  isDiscussing: parentDiscussing,
  onClose,
  onQuickDiscuss,
  onReject,
  onRestore,
  onExecute,
}: SignalDetailDrawerProps) {
  const { t } = useTranslation();
  const [discussing, setDiscussing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [executing, setExecuting] = useState(false);

  const platform = signal.platform || "unknown";
  const screening = signal.metadata?.screening;
  const prepareResult = signal.metadata?.prepare_result;
  const mrd = prepareResult?.blue_case?.mrd;
  const redCase = prepareResult?.red_case;
  const decision = prepareResult?.decision;
  const isProceed = decision === "PROCEED";
  const isRejected = signal.status === "REJECTED";
  const activeDiscussing =
    discussing ||
    !!parentDiscussing ||
    signal.status === "PROCESSING" ||
    signal.metadata?.quick_discuss?.state === "running";

  const handleQuickDiscuss = async () => {
    setDiscussing(true);
    try {
      await onQuickDiscuss(signal.id);
    } finally {
      setDiscussing(false);
    }
  };

  const handleReject = async () => {
    setRejecting(true);
    try {
      await onReject(signal.id);
    } finally {
      setRejecting(false);
    }
  };

  const handleRestore = async () => {
    if (!onRestore) return;
    setRestoring(true);
    try {
      await onRestore(signal.id);
    } finally {
      setRestoring(false);
    }
  };

  const handleExecute = async () => {
    if (!onExecute) return;
    setExecuting(true);
    try {
      await onExecute(signal.id);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-xl bg-zinc-950 border-l border-zinc-800 z-50 flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <span
              className={clsx(
                "text-xs font-mono px-2.5 py-1 rounded-full border",
                platformColors[platform] || "bg-zinc-800 text-zinc-400 border-zinc-700"
              )}
            >
              {platformIcons[platform] || ""} {platform}
            </span>
            {isRejected && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">
                REJECTED
              </span>
            )}
            <span className="text-[10px] text-zinc-600 font-mono">
              {new Date(signal.received_at).toLocaleString()}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {/* Title */}
          <div>
            <h2 className="text-lg font-bold text-zinc-100 mb-2">
              {screening?.title || "Untitled Signal"}
            </h2>
            {signal.source_url && (
              <a
                href={signal.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1.5"
              >
                <ExternalLink className="w-3 h-3" />
                {signal.source_url.length > 70
                  ? signal.source_url.slice(0, 70) + "..."
                  : signal.source_url}
              </a>
            )}
          </div>

          {/* Score overview */}
          {screening && (
            <div className="flex items-center gap-3 flex-wrap">
              <ScoreBadge score={screening.score} label={t('signalDetail.signalScore')} />
              {prepareResult?.blue_case?.market_opportunity_score !== undefined && (
                <ScoreBadge
                  score={prepareResult.blue_case.market_opportunity_score}
                  label={t('signalDetail.marketOpportunity')}
                />
              )}
              {prepareResult?.blue_case?.vision_alignment_score !== undefined && (
                <ScoreBadge
                  score={prepareResult.blue_case.vision_alignment_score}
                  label={t('signalDetail.visionAlignment')}
                />
              )}
            </div>
          )}

          {/* Decision badge (if analyzed) */}
          {decision && (
            <div
              className={clsx(
                "flex items-center gap-2.5 px-4 py-3 rounded-lg border",
                isProceed
                  ? "bg-emerald-500/5 border-emerald-500/20"
                  : "bg-red-500/5 border-red-500/20"
              )}
            >
              {isProceed ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <XCircle className="w-5 h-5 text-red-400" />
              )}
              <div>
                <div
                  className={clsx(
                    "text-sm font-bold",
                    isProceed ? "text-emerald-400" : "text-red-400"
                  )}
                >
                  {isProceed ? t('signalDetail.proceedDecision') : t('signalDetail.haltDecision')}
                </div>
                {prepareResult?.business_verdict && (
                  <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                    {prepareResult.business_verdict}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Discussing progress indicator */}
          {activeDiscussing && !prepareResult && (
            <div className="border border-violet-500/20 bg-violet-500/5 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
                </div>
                <div>
                  <div className="text-sm font-bold text-violet-300">
                    {t('signalDetail.discussingTitle')}
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    {t('signalDetail.discussingDesc')}
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                {[
                  { icon: <Search className="w-3 h-3" />, label: t('signalDetail.stepResearcher'), color: "text-zinc-400" },
                  { icon: <Shield className="w-3 h-3" />, label: t('signalDetail.stepBlueTeam'), color: "text-blue-400" },
                  { icon: <ShieldAlert className="w-3 h-3" />, label: t('signalDetail.stepRedTeam'), color: "text-red-400" },
                  { icon: <Gavel className="w-3 h-3" />, label: t('signalDetail.stepArbitrator'), color: "text-purple-400" },
                ].map((step, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px] text-zinc-600">
                    <span className={step.color}>{step.icon}</span>
                    {step.label}
                  </div>
                ))}
              </div>
              <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-violet-500/50 rounded-full animate-pulse" style={{ width: "100%" }} />
              </div>
            </div>
          )}

          {/* Section 1: Screening */}
          {screening && (
            <Section
              icon={<BarChart3 className="w-4 h-4" />}
              title={t('signalDetail.screening')}
              color="text-amber-400"
            >
              <KV label={t('signalDetail.summary')}>{screening.summary}</KV>
              <KV label={t('signalDetail.scoreReason')}>{screening.reason}</KV>
            </Section>
          )}

          {/* Section 2: Raw content */}
          <Section
            icon={<FileText className="w-4 h-4" />}
            title={t('signalDetail.rawContent')}
            defaultOpen={!screening}
            color="text-zinc-500"
          >
            <p className="text-xs text-zinc-400 whitespace-pre-wrap leading-relaxed">
              {signal.content}
            </p>
          </Section>

          {/* Section 3: Blue Team MRD */}
          {mrd && (
            <Section
              icon={<Shield className="w-4 h-4" />}
              title={t('signalDetail.blueTeamMrd')}
              color="text-blue-400"
            >
              {mrd.executive_pitch && (
                <KV label="Executive Pitch">{mrd.executive_pitch}</KV>
              )}
              {mrd.market_overview && (
                <div>
                  <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">
                    {t('signalDetail.marketOverview')}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {mrd.market_overview.market_size && (
                      <div className="bg-zinc-900 rounded-lg px-3 py-2">
                        <div className="text-[10px] text-zinc-600">{t('signalDetail.marketSize')}</div>
                        <div className="text-xs text-zinc-300 mt-0.5">
                          {mrd.market_overview.market_size}
                        </div>
                      </div>
                    )}
                    {mrd.market_overview.growth_trend && (
                      <div className="bg-zinc-900 rounded-lg px-3 py-2">
                        <div className="text-[10px] text-zinc-600">{t('signalDetail.growthTrend')}</div>
                        <div className="text-xs text-zinc-300 mt-0.5">
                          {mrd.market_overview.growth_trend}
                        </div>
                      </div>
                    )}
                  </div>
                  {mrd.market_overview.key_drivers?.length > 0 && (
                    <div className="mt-2">
                      <div className="text-[10px] text-zinc-600 mb-1">{t('signalDetail.keyDrivers')}</div>
                      <ul className="space-y-1">
                        {mrd.market_overview.key_drivers.map((d: string, i: number) => (
                          <li
                            key={i}
                            className="text-xs text-zinc-400 flex items-start gap-1.5"
                          >
                            <span className="text-blue-400 mt-0.5">•</span>
                            {d}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              {mrd.target_personas?.length > 0 && (
                <div>
                  <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">
                    {t('signalDetail.targetPersonas')}
                  </div>
                  <div className="space-y-2">
                    {mrd.target_personas.map((p: any, i: number) => (
                      <div key={i} className="bg-zinc-900 rounded-lg px-3 py-2.5">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Users className="w-3 h-3 text-purple-400" />
                          <span className="text-xs font-bold text-zinc-200">
                            {p.name}
                          </span>
                        </div>
                        {p.description && (
                          <p className="text-[11px] text-zinc-400 mb-1.5">
                            {p.description}
                          </p>
                        )}
                        {p.pain_points?.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {p.pain_points.map((pp: string, j: number) => (
                              <span
                                key={j}
                                className="text-[10px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded"
                              >
                                {pp}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {mrd.competitive_landscape && (
                <div>
                  <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">
                    {t('signalDetail.competitiveLandscape')}
                  </div>
                  <div className="space-y-2">
                    {mrd.competitive_landscape.key_players?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {mrd.competitive_landscape.key_players.map(
                          (p: string, i: number) => (
                            <span
                              key={i}
                              className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full"
                            >
                              {p}
                            </span>
                          )
                        )}
                      </div>
                    )}
                    {mrd.competitive_landscape.our_differentiation && (
                      <KV label={t('signalDetail.differentiation')}>
                        {mrd.competitive_landscape.our_differentiation}
                      </KV>
                    )}
                  </div>
                </div>
              )}
              {mrd.roi_projection && (
                <div>
                  <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">
                    {t('signalDetail.roiProjection')}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {mrd.roi_projection.investment_estimate && (
                      <div className="bg-zinc-900 rounded-lg px-3 py-2">
                        <div className="text-[10px] text-zinc-600">{t('signalDetail.investmentEstimate')}</div>
                        <div className="text-xs text-zinc-300 mt-0.5">
                          {mrd.roi_projection.investment_estimate}
                        </div>
                      </div>
                    )}
                    {mrd.roi_projection.expected_return && (
                      <div className="bg-zinc-900 rounded-lg px-3 py-2">
                        <div className="text-[10px] text-zinc-600">{t('signalDetail.expectedReturn')}</div>
                        <div className="text-xs text-zinc-300 mt-0.5">
                          {mrd.roi_projection.expected_return}
                        </div>
                      </div>
                    )}
                    {mrd.roi_projection.payback_period && (
                      <div className="bg-zinc-900 rounded-lg px-3 py-2">
                        <div className="text-[10px] text-zinc-600">{t('signalDetail.paybackPeriod')}</div>
                        <div className="text-xs text-zinc-300 mt-0.5">
                          {mrd.roi_projection.payback_period}
                        </div>
                      </div>
                    )}
                    {mrd.roi_projection.confidence_level && (
                      <div className="bg-zinc-900 rounded-lg px-3 py-2">
                        <div className="text-[10px] text-zinc-600">{t('signalDetail.confidenceLevel')}</div>
                        <div className="text-xs text-zinc-300 mt-0.5">
                          {mrd.roi_projection.confidence_level === "high"
                            ? t('signalDetail.confidenceHigh')
                            : mrd.roi_projection.confidence_level === "medium"
                              ? t('signalDetail.confidenceMedium')
                              : t('signalDetail.confidenceLow')}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {mrd.market_timing && <KV label={t('signalDetail.marketTiming')}>{mrd.market_timing}</KV>}
              {mrd.success_metrics?.length > 0 && (
                <div>
                  <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">
                    {t('signalDetail.successMetrics')}
                  </div>
                  <ul className="space-y-1">
                    {mrd.success_metrics.map((m: string, i: number) => (
                      <li
                        key={i}
                        className="text-xs text-zinc-400 flex items-start gap-1.5"
                      >
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 mt-0.5 flex-shrink-0" />
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>
          )}

          {/* Section 4: Red Team */}
          {redCase && (
            <Section
              icon={<ShieldAlert className="w-4 h-4" />}
              title={t('signalDetail.redTeam')}
              color="text-red-400"
            >
              {redCase.critique && <KV label={t('signalDetail.coreCritique')}>{redCase.critique}</KV>}
              {redCase.risks?.length > 0 && (
                <div>
                  <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">
                    {t('signalDetail.riskItems')}
                  </div>
                  <ul className="space-y-1.5">
                    {redCase.risks.map((r: string, i: number) => (
                      <li
                        key={i}
                        className="text-xs text-zinc-400 flex items-start gap-1.5"
                      >
                        <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {redCase.roi_challenges && (
                <div>
                  <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">
                    {t('signalDetail.roiChallenges')}
                  </div>
                  <div className="space-y-2">
                    {redCase.roi_challenges.investment_reality_check && (
                      <KV label={t('signalDetail.investmentReality')}>
                        {redCase.roi_challenges.investment_reality_check}
                      </KV>
                    )}
                    {redCase.roi_challenges.return_skepticism && (
                      <KV label={t('signalDetail.returnSkepticism')}>
                        {redCase.roi_challenges.return_skepticism}
                      </KV>
                    )}
                    {redCase.roi_challenges.hidden_costs?.length > 0 && (
                      <div>
                        <div className="text-[10px] text-zinc-600 mb-1">{t('signalDetail.hiddenCosts')}</div>
                        <ul className="space-y-1">
                          {redCase.roi_challenges.hidden_costs.map(
                            (c: string, i: number) => (
                              <li
                                key={i}
                                className="text-xs text-zinc-400 flex items-start gap-1.5"
                              >
                                <span className="text-red-400">•</span>
                                {c}
                              </li>
                            )
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {redCase.opportunity_cost && (
                <KV label={t('signalDetail.opportunityCost')}>{redCase.opportunity_cost}</KV>
              )}
              {redCase.market_risks?.length > 0 && (
                <div>
                  <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">
                    {t('signalDetail.marketRisks')}
                  </div>
                  <ul className="space-y-1">
                    {redCase.market_risks.map((r: string, i: number) => (
                      <li
                        key={i}
                        className="text-xs text-zinc-400 flex items-start gap-1.5"
                      >
                        <span className="text-red-400">•</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>
          )}

          {/* Section 5: Arbitrator */}
          {prepareResult?.arbitrator_rationale && (
            <Section
              icon={<Gavel className="w-4 h-4" />}
              title={t('signalDetail.arbitrator')}
              color="text-purple-400"
            >
              <KV label={t('signalDetail.arbitratorRationale')}>{prepareResult.arbitrator_rationale}</KV>
              {prepareResult.summary && (
                <KV label={t('signalDetail.summaryLabel')}>{prepareResult.summary}</KV>
              )}
            </Section>
          )}

          {/* Section 6: Logs (pipeline steps) */}
          {prepareResult?.logs?.length > 0 && (
            <Section
              icon={<Search className="w-4 h-4" />}
              title={t('signalDetail.processLogs')}
              defaultOpen={false}
              color="text-zinc-500"
            >
              <div className="bg-zinc-900 rounded-lg p-3 max-h-60 overflow-y-auto">
                {prepareResult.logs.map((log: string, i: number) => (
                  <div key={i} className="text-[11px] text-zinc-500 font-mono leading-5">
                    {log}
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* Footer: Actions */}
        <div className="px-5 py-4 border-t border-zinc-800 flex items-center gap-3">
          {isRejected ? (
            onRestore && (
              <button
                onClick={handleRestore}
                disabled={restoring}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-60"
              >
                {restoring ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
                {t('signalDetail.restoreToPending')}
              </button>
            )
          ) : activeDiscussing && !prepareResult ? (
            <div className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-lg bg-violet-600/20 text-violet-400 cursor-wait">
              <Loader2 className="w-4 h-4 animate-spin" /> {t('signalDetail.discussing')}
            </div>
          ) : prepareResult && isProceed && onExecute ? (
            <button
              onClick={handleExecute}
              disabled={executing}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-all disabled:opacity-60"
            >
              {executing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
              {executing ? t('signalDetail.executing') : t('signalDetail.execute')}
            </button>
          ) : prepareResult ? (
            <div className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-lg bg-zinc-800/60 text-zinc-400">
              {isProceed ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <XCircle className="w-4 h-4 text-red-400" />
              )}
              {isProceed ? t('signalDetail.discussedProceed') : t('signalDetail.discussedHalt')}
            </div>
          ) : (
            <>
              <button
                onClick={handleQuickDiscuss}
                disabled={discussing || rejecting}
                className={clsx(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-lg transition-all",
                  discussing
                    ? "bg-violet-600/20 text-violet-400 cursor-wait"
                    : "bg-violet-600 text-white hover:bg-violet-500"
                )}
              >
                {discussing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> {t('signalDetail.discussing')}
                  </>
                ) : (
                  <>
                    <MessageSquarePlus className="w-4 h-4" /> Quick Discuss
                  </>
                )}
              </button>
              <button
                onClick={handleReject}
                disabled={discussing || rejecting}
                className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-zinc-400 hover:text-red-400 hover:bg-red-500/10 border border-zinc-800 hover:border-red-500/20 rounded-lg transition-colors"
              >
                {rejecting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ThumbsDown className="w-4 h-4" />
                )}
                Reject
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

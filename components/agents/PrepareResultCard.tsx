"use client";

import { useState, useEffect } from "react";
import {
  Scale,
  TrendingUp,
  Users,
  Swords,
  ShieldAlert,
  Target,
  Clock,
  DollarSign,
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Lightbulb,
  Edit2,
  Save,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { useTranslation } from "@/lib/i18n";
import type { PrepareResult } from "@/store/usePulseStore.new";

const MotionDiv = motion.div;

interface PrepareResultCardProps {
  result: PrepareResult;
  onProceed: (editedResult: PrepareResult) => void;
  onUpdate: (result: PrepareResult) => void;
  hideAction?: boolean;
}

function SectionHeader({ icon: Icon, title, color = "text-zinc-400" }: { icon: any; title: string; color?: string }) {
  return (
    <div className={clsx("flex items-center gap-2 mb-3", color)}>
      <Icon className="w-4 h-4" />
      <h3 className="text-xs font-bold uppercase tracking-wider">{title}</h3>
    </div>
  );
}

function MetricBadge({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className={clsx("px-3 py-2 rounded-lg border", color)}>
      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</div>
      <div className="text-sm font-bold mt-0.5">{value}</div>
    </div>
  );
}

export function PrepareResultCard({ result, onProceed, onUpdate, hideAction }: PrepareResultCardProps) {
  const { t } = useTranslation();
  const [editForm, setEditForm] = useState(result);
  const [showDetails, setShowDetails] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => { setEditForm(result); }, [result]);

  const isProceed = editForm.decision === "PROCEED";
  const mrd = editForm.blue_case?.mrd;
  const roi = mrd?.roi_projection;
  const roiChallenges = editForm.red_case?.roi_challenges;

  const handleSave = () => {
    onUpdate(editForm);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditForm(result);
    setIsEditing(false);
  };

  return (
    <MotionDiv
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="w-full bg-paper border border-border rounded-xl shadow-2xl relative overflow-hidden"
    >
      <div className={clsx("absolute top-0 left-0 w-full h-1", isProceed ? "bg-gradient-to-r from-blue-500 to-emerald-500" : "bg-red-500")} />

      {/* ── Executive Pitch (Hero Section) ── */}
      <div className="p-6 pb-4">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className={clsx(
              "inline-block text-[10px] font-mono px-2.5 py-1 rounded-full mb-3",
              isProceed ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
            )}>
              {editForm.decision}
            </div>
            {mrd?.executive_pitch ? (
              <p className="text-base text-zinc-200 leading-relaxed font-medium">
                {mrd.executive_pitch}
              </p>
            ) : (
              <p className="text-base text-zinc-200 leading-relaxed font-medium">
                {editForm.blue_case.proposal}
              </p>
            )}
          </div>
          <div className="flex gap-1 ml-4 flex-shrink-0">
            {isEditing ? (
              <>
                <button onClick={handleCancel} className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-500"><X className="w-3.5 h-3.5" /></button>
                <button onClick={handleSave} className="p-1.5 bg-green-900/30 hover:bg-green-900/50 text-green-400 rounded-lg"><Save className="w-3.5 h-3.5" /></button>
              </>
            ) : (
              <button onClick={() => setIsEditing(true)} className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-500"><Edit2 className="w-3.5 h-3.5" /></button>
            )}
          </div>
        </div>

        {/* Score Badges */}
        <div className="flex gap-3 flex-wrap">
          <MetricBadge
            label={t('prepare.visionAlignment')}
            value={`${editForm.blue_case.vision_alignment_score}/100`}
            color="bg-blue-500/5 border-blue-500/20 text-blue-400"
          />
          <MetricBadge
            label={t('prepare.marketOpportunity')}
            value={`${editForm.blue_case.market_opportunity_score || '—'}/100`}
            color="bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
          />
          {roi?.confidence_level && (
            <MetricBadge
              label={t('prepare.roiConfidence')}
              value={roi.confidence_level === 'high' ? t('signalDetail.confidenceHigh') : roi.confidence_level === 'medium' ? t('signalDetail.confidenceMedium') : t('signalDetail.confidenceLow')}
              color={clsx(
                "border",
                roi.confidence_level === 'high' ? "bg-green-500/5 border-green-500/20 text-green-400"
                  : roi.confidence_level === 'medium' ? "bg-yellow-500/5 border-yellow-500/20 text-yellow-400"
                  : "bg-red-500/5 border-red-500/20 text-red-400"
              )}
            />
          )}
        </div>
      </div>

      {/* ── Business Verdict (Arbitrator) ── */}
      {editForm.business_verdict && (
        <div className="mx-6 mb-4 p-4 bg-gradient-to-r from-zinc-900/80 to-zinc-800/40 border border-zinc-700/50 rounded-lg">
          <SectionHeader icon={Scale} title={t('prepare.businessVerdict')} color="text-yellow-500" />
          <p className="text-sm text-zinc-300 leading-relaxed">{editForm.business_verdict}</p>
        </div>
      )}

      {/* ── MRD Content ── */}
      {mrd && (
        <div className="px-6 pb-4 space-y-4">
          {/* Market Overview */}
          {mrd.market_overview && (mrd.market_overview.market_size || mrd.market_overview.growth_trend) && (
            <div className="p-4 bg-zinc-900/50 border border-zinc-800/50 rounded-lg">
              <SectionHeader icon={BarChart3} title={t('prepare.marketOverview')} color="text-blue-400" />
              <div className="space-y-2 text-sm">
                {mrd.market_overview.market_size && (
                  <div>
                    <span className="text-zinc-500 text-xs">{t('prepare.marketSize')}</span>
                    <p className="text-zinc-300">{mrd.market_overview.market_size}</p>
                  </div>
                )}
                {mrd.market_overview.growth_trend && (
                  <div>
                    <span className="text-zinc-500 text-xs">{t('prepare.growthTrend')}</span>
                    <p className="text-zinc-300">{mrd.market_overview.growth_trend}</p>
                  </div>
                )}
                {mrd.market_overview.key_drivers?.length > 0 && (
                  <div>
                    <span className="text-zinc-500 text-xs">{t('prepare.keyDrivers')}</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {mrd.market_overview.key_drivers.map((d, i) => (
                        <span key={i} className="px-2 py-0.5 text-[11px] bg-blue-500/10 text-blue-300 rounded-full border border-blue-500/20">
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Target Personas */}
          {mrd.target_personas?.length > 0 && (
            <div className="p-4 bg-zinc-900/50 border border-zinc-800/50 rounded-lg">
              <SectionHeader icon={Users} title={t('prepare.targetPersonas')} color="text-purple-400" />
              <div className="space-y-3">
                {mrd.target_personas.map((persona, i) => (
                  <div key={i} className="p-3 bg-black/30 rounded-lg border border-zinc-800/30">
                    <div className="font-medium text-sm text-zinc-200">{persona.name}</div>
                    {persona.description && <p className="text-xs text-zinc-500 mt-0.5">{persona.description}</p>}
                    {persona.pain_points?.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {persona.pain_points.map((p, j) => (
                          <div key={j} className="flex items-start gap-1.5 text-xs text-zinc-400">
                            <span className="text-red-400 mt-0.5">•</span>
                            <span>{p}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {persona.current_alternatives && (
                      <div className="mt-2 text-xs text-zinc-500">
                        <span className="text-zinc-600">{t('prepare.currentAlternatives')}</span> {persona.current_alternatives}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Competitive Landscape */}
          {mrd.competitive_landscape && (mrd.competitive_landscape.our_differentiation || mrd.competitive_landscape.key_players?.length > 0) && (
            <div className="p-4 bg-zinc-900/50 border border-zinc-800/50 rounded-lg">
              <SectionHeader icon={Swords} title={t('prepare.competitiveLandscape')} color="text-orange-400" />
              <div className="space-y-2 text-sm">
                {mrd.competitive_landscape.key_players?.length > 0 && (
                  <div>
                    <span className="text-zinc-500 text-xs">{t('prepare.keyCompetitors')}</span>
                    <div className="mt-1 space-y-1">
                      {mrd.competitive_landscape.key_players.map((p, i) => (
                        <div key={i} className="text-xs text-zinc-400 pl-2 border-l-2 border-zinc-700">{p}</div>
                      ))}
                    </div>
                  </div>
                )}
                {mrd.competitive_landscape.our_differentiation && (
                  <div className="mt-2 p-2.5 bg-emerald-500/5 border border-emerald-500/15 rounded-lg">
                    <span className="text-[10px] text-emerald-500 uppercase tracking-wider font-bold">{t('prepare.differentiationAdvantage')}</span>
                    <p className="text-xs text-emerald-300 mt-1">{mrd.competitive_landscape.our_differentiation}</p>
                  </div>
                )}
                {mrd.competitive_landscape.competitive_advantage && (
                  <div className="text-xs text-zinc-400">
                    <span className="text-zinc-500">{t('prepare.coreCompetitiveAdvantage')}</span> {mrd.competitive_landscape.competitive_advantage}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ROI Projection */}
          {roi && (roi.investment_estimate || roi.expected_return) && (
            <div className="p-4 bg-zinc-900/50 border border-zinc-800/50 rounded-lg">
              <SectionHeader icon={DollarSign} title={t('prepare.roiProjection')} color="text-green-400" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {roi.investment_estimate && (
                  <div className="p-3 bg-black/30 rounded-lg text-center">
                    <div className="text-[10px] text-zinc-500 uppercase">{t('prepare.investmentEstimate')}</div>
                    <div className="text-sm text-zinc-200 font-medium mt-1">{roi.investment_estimate}</div>
                  </div>
                )}
                {roi.expected_return && (
                  <div className="p-3 bg-black/30 rounded-lg text-center">
                    <div className="text-[10px] text-zinc-500 uppercase">{t('prepare.expectedReturn')}</div>
                    <div className="text-sm text-green-400 font-medium mt-1">{roi.expected_return}</div>
                  </div>
                )}
                {roi.payback_period && (
                  <div className="p-3 bg-black/30 rounded-lg text-center">
                    <div className="text-[10px] text-zinc-500 uppercase">{t('prepare.paybackPeriod')}</div>
                    <div className="text-sm text-zinc-200 font-medium mt-1">{roi.payback_period}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Market Timing */}
          {mrd.market_timing && (
            <div className="p-4 bg-zinc-900/50 border border-zinc-800/50 rounded-lg">
              <SectionHeader icon={Clock} title={t('prepare.whyNow')} color="text-cyan-400" />
              <p className="text-sm text-zinc-300 leading-relaxed">{mrd.market_timing}</p>
            </div>
          )}

          {/* Success Metrics */}
          {mrd.success_metrics?.length > 0 && (
            <div className="p-4 bg-zinc-900/50 border border-zinc-800/50 rounded-lg">
              <SectionHeader icon={Target} title={t('prepare.successMetrics')} color="text-indigo-400" />
              <div className="space-y-1.5">
                {mrd.success_metrics.map((m, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                    <TrendingUp className="w-3.5 h-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />
                    <span>{m}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Risk Analysis (from Critic) ── */}
      <div className="px-6 pb-4">
        <div className="p-4 bg-red-900/5 border border-red-900/20 rounded-lg space-y-3">
          <SectionHeader icon={AlertTriangle} title={t('prepare.riskReview')} color="text-red-400" />

          {editForm.red_case.critique && (
            <p className="text-xs text-zinc-400 leading-relaxed">{editForm.red_case.critique}</p>
          )}

          {editForm.red_case.risks?.length > 0 && (
            <div>
              <span className="text-[10px] text-red-400/70 uppercase tracking-wider">{t('prepare.techBusinessRisks')}</span>
              <ul className="mt-1.5 space-y-1">
                {editForm.red_case.risks.slice(0, 5).map((r, i) => (
                  <li key={i} className="text-xs text-red-300/80 flex items-start gap-1.5">
                    <span className="text-red-500 mt-0.5">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ROI Challenges */}
          {roiChallenges && (
            <div className="mt-2 p-3 bg-black/20 rounded-lg space-y-2">
              <span className="text-[10px] text-yellow-500/80 uppercase tracking-wider font-bold">{t('prepare.roiAudit')}</span>
              {roiChallenges.investment_reality_check && (
                <div className="text-xs text-zinc-400">
                  <span className="text-zinc-500">{t('prepare.investmentReview')}</span> {roiChallenges.investment_reality_check}
                </div>
              )}
              {roiChallenges.return_skepticism && (
                <div className="text-xs text-zinc-400">
                  <span className="text-zinc-500">{t('prepare.returnSkepticism')}</span> {roiChallenges.return_skepticism}
                </div>
              )}
              {roiChallenges.hidden_costs?.length > 0 && (
                <div className="text-xs text-zinc-400">
                  <span className="text-zinc-500">{t('prepare.hiddenCosts')}</span> {roiChallenges.hidden_costs.join('、')}
                </div>
              )}
            </div>
          )}

          {/* Opportunity Cost */}
          {editForm.red_case.opportunity_cost && (
            <div className="text-xs text-zinc-400">
              <span className="text-zinc-500">{t('prepare.opportunityCost')}</span> {editForm.red_case.opportunity_cost}
            </div>
          )}

          {/* Market Risks */}
          {editForm.red_case.market_risks && editForm.red_case.market_risks.length > 0 && (
            <div>
              <span className="text-[10px] text-orange-400/70 uppercase tracking-wider">{t('prepare.marketRisks')}</span>
              <ul className="mt-1 space-y-1">
                {editForm.red_case.market_risks.map((r, i) => (
                  <li key={i} className="text-xs text-orange-300/80 flex items-start gap-1.5">
                    <span className="text-orange-500 mt-0.5">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* ── Detailed Verdict (collapsible) ── */}
      <div className="px-6 pb-4">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {showDetails ? t('prepare.collapseDetails') : t('prepare.expandDetails')}
        </button>
        {showDetails && (
          <div className="mt-3 p-4 bg-black/20 rounded-lg border border-border text-sm text-zinc-400 space-y-2">
            {editForm.summary && (
              <div>
                <span className="text-zinc-500 text-xs block mb-1">{t('prepare.coreDivergence')}</span>
                <p>{editForm.summary}</p>
              </div>
            )}
            {editForm.arbitrator_rationale && (
              <div>
                <span className="text-zinc-500 text-xs block mb-1">{t('prepare.verdictLogic')}</span>
                <p>{editForm.arbitrator_rationale}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Action Button ── */}
      {!isEditing && !hideAction && (
        <div className="px-6 pb-6">
          <button
            onClick={() => onProceed(editForm)}
            className={clsx(
              "w-full flex items-center justify-center py-3.5 text-sm font-bold rounded-lg transition-all",
              isProceed
                ? "bg-white text-black hover:bg-zinc-200"
                : "bg-red-900/20 text-red-500 border border-red-900/50 hover:bg-red-900/30"
            )}
          >
            {isProceed ? (
              <>{t('prepare.launchProject')} <ArrowRight className="w-4 h-4 ml-2" /></>
            ) : (
              <>{t('prepare.forceOverride')} <ShieldAlert className="w-4 h-4 ml-2" /></>
            )}
          </button>
        </div>
      )}
    </MotionDiv>
  );
}

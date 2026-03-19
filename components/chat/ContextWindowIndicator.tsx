"use client";

import { useMemo } from "react";
import { useTranslation } from "@/lib/i18n";

interface Props {
  /** Usage ratio 0–1 (0 = empty context, 1 = full context) */
  ratio: number;
  /** Estimated tokens used */
  estimated?: number;
  /** Max tokens available */
  max?: number;
}

// ~95% of the original battery body footprint (~24×36)
const W = 23;
const H = 34;

/**
 * Frosted-glass "R" letter indicator for context window usage.
 * Energy dots inside the R fill with an animated wave effect.
 * Color transitions: green → yellow → red based on usage level.
 */
export function ContextWindowIndicator({ ratio, estimated, max }: Props) {
  const { t } = useTranslation();
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  const percent = Math.round(clampedRatio * 100);

  // Fill level: 0 → wave at bottom (empty), 1 → wave at top (full)
  const fillY = H * (1 - clampedRatio);

  const fillColor = useMemo(() => {
    if (clampedRatio < 0.5) return "#10b981";
    if (clampedRatio < 0.75) return "#eab308";
    return "#ef4444";
  }, [clampedRatio]);

  const glowFilter = useMemo(() => {
    if (clampedRatio <= 0) return undefined;
    if (clampedRatio < 0.5) return "drop-shadow(0 0 4px rgba(16,185,129,0.3))";
    if (clampedRatio < 0.75) return "drop-shadow(0 0 4px rgba(234,179,8,0.3))";
    return "drop-shadow(0 0 4px rgba(239,68,68,0.3))";
  }, [clampedRatio]);

  const tokenLabel =
    estimated != null && max != null
      ? `${Math.round(estimated / 1000)}k / ${Math.round(max / 1000)}k`
      : undefined;

  // Two wave paths with different phase for depth
  const amp = 2.5;
  const wave1D = wavePath(fillY, amp, W, H);
  const wave2D = wavePath(fillY + 1.5, -amp, W, H);

  return (
    <div className="relative group flex-shrink-0 cursor-default">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        overflow="hidden"
        style={{ filter: glowFilter }}
      >
        <defs>
          {/* R letter clip shape */}
          <clipPath id="ctx-r-clip">
            <text
              x="0"
              y={H - 3}
              fontSize={H - 2}
              fontWeight="900"
              fontFamily="Arial,Helvetica,sans-serif"
            >
              R
            </text>
          </clipPath>
          {/* Dot grid pattern for energy-dot texture */}
          <pattern
            id="ctx-dot-grid"
            width="3.5"
            height="3.5"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1.75" cy="1.75" r="0.7" fill="rgba(255,255,255,0.12)" />
          </pattern>
        </defs>

        {/* All content clipped to R shape */}
        <g clipPath="url(#ctx-r-clip)">
          {/* Frosted glass background */}
          <rect width={W} height={H} fill="rgba(255,255,255,0.06)" />

          {/* Primary wave fill */}
          <path d={wave1D} fill={fillColor} opacity="0.55">
            <animateTransform
              attributeName="transform"
              type="translate"
              values={`0,0;${W},0`}
              dur="3s"
              repeatCount="indefinite"
            />
          </path>

          {/* Secondary wave fill (offset phase, slower) */}
          <path d={wave2D} fill={fillColor} opacity="0.3">
            <animateTransform
              attributeName="transform"
              type="translate"
              values={`0,0;${-W},0`}
              dur="4s"
              repeatCount="indefinite"
            />
          </path>

          {/* Energy dot grid overlay */}
          <rect width={W} height={H} fill="url(#ctx-dot-grid)" />
        </g>

        {/* R outline — frosted glass edge (stronger visibility) */}
        <text
          x="0"
          y={H - 3}
          fontSize={H - 2}
          fontWeight="900"
          fontFamily="Arial,Helvetica,sans-serif"
          fill="none"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth="1"
        />
      </svg>

      {/* Tooltip on hover */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-md text-[10px] text-[var(--text-primary)] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
        <div>{t("chat.contextUsage").replace("{percent}", String(percent))}</div>
        {tokenLabel && <div className="text-[var(--text-muted)]">{tokenLabel}</div>}
      </div>
    </div>
  );
}

/**
 * Generate an SVG path for a sine wave filling from `fy` down to `h`.
 * Spans 3 full periods (−w to 2w) so a translateX(w) animation loops seamlessly.
 */
function wavePath(fy: number, amp: number, w: number, h: number): string {
  const q = w / 4; // quarter-wavelength
  return [
    `M ${-w} ${fy}`,
    `Q ${-w + q} ${fy - amp} ${-w + 2 * q} ${fy}`,
    `Q ${-w + 3 * q} ${fy + amp} 0 ${fy}`,
    `Q ${q} ${fy - amp} ${2 * q} ${fy}`,
    `Q ${3 * q} ${fy + amp} ${w} ${fy}`,
    `Q ${w + q} ${fy - amp} ${w + 2 * q} ${fy}`,
    `Q ${w + 3 * q} ${fy + amp} ${2 * w} ${fy}`,
    `V ${h} H ${-w} Z`,
  ].join(" ");
}

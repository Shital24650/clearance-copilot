import React, { useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  HelpCircle,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Search,
  Quote,
  ShieldAlert,
  ArrowRight,
} from "lucide-react";
import { VerifiedClaim, RiskVerdict } from "../types/clearance";

interface ClaimCardProps {
  claim: VerifiedClaim;
  index: number;
}

const VERDICT_STYLES: Record<
  RiskVerdict,
  {
    bg: string;
    border: string;
    badgeBg: string;
    badgeText: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  "HIGH-RISK": {
    bg: "bg-red-950/20",
    border: "border-red-900/60",
    badgeBg: "bg-red-500/20 border-red-500/40",
    badgeText: "text-red-300",
    icon: AlertOctagon,
  },
  "CLEARANCE-REVIEW": {
    bg: "bg-amber-950/20",
    border: "border-amber-900/60",
    badgeBg: "bg-amber-500/20 border-amber-500/40",
    badgeText: "text-amber-300",
    icon: AlertTriangle,
  },
  "FACTUAL-CONCERN": {
    bg: "bg-blue-950/20",
    border: "border-blue-900/60",
    badgeBg: "bg-blue-500/20 border-blue-500/40",
    badgeText: "text-blue-300",
    icon: HelpCircle,
  },
  "LOW-RISK": {
    bg: "bg-emerald-950/20",
    border: "border-emerald-900/60",
    badgeBg: "bg-emerald-500/20 border-emerald-500/40",
    badgeText: "text-emerald-300",
    icon: CheckCircle2,
  },
};

const formatCrossCheckModel = (modelUsed?: string): string => {
  if (!modelUsed) return "GEMINI 3.8 FLASH";
  const upper = modelUsed.toUpperCase().trim();
  if (upper === "GEMINI-3.1-FLASH-LITE" || upper === "GEMINI 3.1 FLASH-LITE" || upper === "GEMINI 3.1 FLASH LITE") {
    return "GEMINI 3.1 FLASH-LITE";
  }
  if (upper === "GEMINI-3.8-FLASH" || upper === "GEMINI 3.8 FLASH") {
    return "GEMINI 3.8 FLASH";
  }
  return upper.replace(/^GEMINI-/, "GEMINI ");
};

export const ClaimCard: React.FC<ClaimCardProps> = ({ claim, index }) => {
  const [expanded, setExpanded] = useState(true);
  const style = VERDICT_STYLES[claim.verdict] || VERDICT_STYLES["CLEARANCE-REVIEW"];
  const VerdictIcon = style.icon;

  return (
    <div
      id={`claim-card-${claim.id}`}
      className={`rounded-2xl border ${style.border} ${style.bg} backdrop-blur-sm p-5 transition-all shadow-lg`}
    >
      {/* Card Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pb-3 border-b border-zinc-800/60">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono text-zinc-400">#{index + 1}</span>
            <span className="text-base font-bold text-zinc-100 tracking-tight">
              {claim.entity}
            </span>
            <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded-md bg-zinc-800 border border-zinc-700 text-zinc-300">
              {claim.claimType.replace(/_/g, " ")}
            </span>
            {claim.character && (
              <span className="px-2 py-0.5 text-[10px] font-mono rounded-md bg-zinc-900 text-zinc-400 border border-zinc-800">
                Char: {claim.character}
              </span>
            )}
            {claim.degradedMode && (
              <span
                id={`degraded-mode-badge-${claim.id}`}
                className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/50 flex items-center gap-1 font-semibold shadow-sm"
                title="Verdict was generated without real-time Gemini comparative analysis"
              >
                <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                Estimated without live evidence review
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-300 leading-snug">
            {claim.claim}
          </p>
        </div>

        {/* Verdict Badge & Risk Score */}
        <div className="flex items-center gap-2 self-start shrink-0">
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border font-mono text-xs font-bold ${style.badgeBg} ${style.badgeText}`}
          >
            <VerdictIcon className="w-3.5 h-3.5" />
            <span>{claim.verdict}</span>
            <span className="text-zinc-400 font-normal">|</span>
            <span>{claim.riskScore}/100</span>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
            title={expanded ? "Collapse claim details" : "Expand claim details"}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expandable Evidence & Reasoning Section */}
      {expanded && (
        <div className="mt-4 space-y-3.5 text-xs">
          {/* Step 1: Screenplay Assertion */}
          <div className="bg-zinc-950/80 border border-zinc-800/90 rounded-xl p-3.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400/90 flex items-center gap-1.5 font-semibold">
                <Quote className="w-3 h-3 text-amber-400" />
                1. CLAIM — SCREENPLAY ASSERTION
              </span>
              {claim.sceneContext && (
                <span className="text-[10px] font-mono text-zinc-400">
                  {claim.sceneContext}
                </span>
              )}
            </div>
            <p className="font-mono text-zinc-300 text-xs italic bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800/60 leading-relaxed">
              "{claim.scriptEvidence}"
            </p>
          </div>

          {/* Evidence Conflict Callout if detected */}
          {claim.evidenceConflict && (
            <div className="bg-amber-950/40 border border-amber-500/50 rounded-xl p-3 text-amber-200 flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-amber-300 block">
                  Public Record Discrepancy Detected:
                </span>
                <p className="text-amber-200/90 mt-0.5 leading-relaxed">
                  {claim.conflictSummary || "Retrieved public records diverge from screenplay assertion."}
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Live Parallel Search Evidence Box */}
          <div className="bg-zinc-900/70 border border-emerald-900/50 rounded-xl p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-zinc-800/70">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 font-bold">
                  <Search className="w-3.5 h-3.5 text-emerald-400" />
                  2. LIVE EVIDENCE — PARALLEL AI SEARCH
                </span>
                <p className="text-[10px] text-zinc-400 font-mono">
                  Partner Integration: Parallel AI Search API — Official parallel-web SDK
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Evidence Relevance Gate Badge */}
                {claim.evidenceRelevance === "RELEVANT" && (
                  <span className="px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700/80 flex items-center gap-1 font-semibold">
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                    Evidence: Relevant
                  </span>
                )}
                {claim.evidenceRelevance === "PARTIAL" && (
                  <span className="px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider rounded bg-blue-950/80 text-blue-300 border border-blue-700/80 flex items-center gap-1 font-semibold">
                    Evidence: Partial Match
                  </span>
                )}
                {claim.evidenceRelevance === "NOT_RELEVANT" && (
                  <span className="px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider rounded bg-amber-950/90 text-amber-300 border border-amber-500/80 flex items-center gap-1 font-semibold">
                    <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
                    Evidence: ⚠️ Insufficient / Not Relevant
                  </span>
                )}

                {claim.sourceQuality && (
                  <span className="px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider rounded bg-zinc-800 text-zinc-200 border border-zinc-700">
                    Quality: {claim.sourceQuality}
                  </span>
                )}

                <span
                  className={`px-2 py-0.5 text-[9px] font-mono rounded border ${
                    claim.evidenceStatus === "UNAVAILABLE" || !claim.sourceUrl
                      ? "bg-zinc-900 text-zinc-400 border-zinc-800"
                      : "bg-emerald-950/70 text-emerald-300 border-emerald-700/60"
                  }`}
                >
                  {claim.evidenceStatus === "UNAVAILABLE" || !claim.sourceUrl
                    ? "Evidence Unavailable"
                    : `Live Parallel Results (${claim.parallelEvidence?.length || 1})`}
                </span>
              </div>
            </div>

            {/* Evidence Relevance Gate Warning Banner if retrieved source is irrelevant */}
            {claim.evidenceRelevance === "NOT_RELEVANT" && (
              <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-500/60 text-amber-200 text-xs space-y-1.5">
                <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Evidence Relevance: ⚠️ Insufficient / Not relevant</span>
                </div>
                <p className="leading-relaxed text-amber-200/90 text-xs">
                  {claim.relevanceExplanation ||
                    `Parallel returned this source, but it did not contain sufficient evidence relating to "${claim.entity}". Additional evidence should be retrieved before relying on this source.`}
                </p>
                <p className="text-[10px] text-amber-300/80 font-mono">
                  Guard: Gemini was instructed not to treat this record as proof of clearance. Production rights outreach required.
                </p>
              </div>
            )}

            {claim.sourceUrl ? (
              <div className="p-3 rounded-lg bg-zinc-950/90 border border-zinc-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-zinc-200 text-xs truncate">
                    {claim.sourceTitle || `${claim.entity} Public Record`}
                  </span>
                  <a
                    href={claim.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 hover:text-emerald-300 hover:underline shrink-0"
                    title="Open verified source in new tab"
                  >
                    <span>{claim.sourceDomain || "Verified Source"}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <p className="text-zinc-300 text-xs leading-relaxed">
                  {claim.evidenceSummary}
                </p>
                <div className="pt-2 border-t border-zinc-900 space-y-1 text-[10px] font-mono">
                  <div className="flex items-center gap-1.5 text-emerald-400/90">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>
                      1. Source Integrity: URL verified against actual Parallel Search API responses (anti-hallucination)
                    </span>
                  </div>
                  <div
                    className={`flex items-center gap-1.5 ${
                      claim.evidenceRelevance === "NOT_RELEVANT"
                        ? "text-amber-400/90"
                        : "text-blue-400/90"
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      2. Evidence Relevance:{" "}
                      {claim.evidenceRelevance === "NOT_RELEVANT"
                        ? "Candidate record does not match screenplay assertion (flagged as insufficient)"
                        : "Candidate record matched claim entities and topic"}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-zinc-950/50 border border-zinc-800/60 text-zinc-400 text-xs space-y-1">
                <p className="font-medium text-amber-300/90">Parallel AI Search unavailable</p>
                <p className="leading-relaxed">
                  Live evidence could not be retrieved at runtime. Screenplay assertion flagged for manual production verification.
                </p>
              </div>
            )}
          </div>

          {/* Steps 3 & 4: Gemini Cross-Check & Clearance Review Recommendation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Step 3: Gemini Comparative Reasoning */}
            <div className="bg-zinc-900/50 border border-blue-900/40 rounded-xl p-3.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-blue-400 block mb-1.5 font-semibold">
                3. CROSS-CHECK — {formatCrossCheckModel(claim.modelUsed)}
              </span>
              <p className="text-zinc-300 leading-relaxed text-xs">
                {claim.reasoning}
              </p>
            </div>

            {/* Step 4: Clearance Review Guidance */}
            <div className="bg-zinc-900/50 border border-amber-900/40 rounded-xl p-3.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 block mb-1.5 font-semibold flex items-center gap-1">
                <ArrowRight className="w-3 h-3 text-amber-400" />
                4. ACTION — CLEARANCE REVIEW RECOMMENDATION
              </span>
              <p className="text-zinc-200 font-medium leading-relaxed text-xs">
                {claim.recommendedAction}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React from "react";
import { AlertOctagon, AlertTriangle, HelpCircle, CheckCircle2, ShieldAlert } from "lucide-react";
import { ClearanceRadarMetrics, RiskVerdict } from "../types/clearance";

interface ClearanceRadarProps {
  metrics: ClearanceRadarMetrics;
  selectedFilter: RiskVerdict | "ALL";
  onSelectFilter: (filter: RiskVerdict | "ALL") => void;
  evidenceConflictFilter: boolean;
  onToggleConflictFilter: () => void;
}

export const ClearanceRadar: React.FC<ClearanceRadarProps> = ({
  metrics,
  selectedFilter,
  onSelectFilter,
  evidenceConflictFilter,
  onToggleConflictFilter,
}) => {
  return (
    <div
      id="clearance-radar-panel"
      className="bg-[#12151d] border border-zinc-800/90 rounded-2xl p-5 shadow-xl"
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-zinc-100 tracking-tight">
              Prioritized Clearance Radar
            </h2>
            <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-zinc-800 text-zinc-300">
              {metrics.totalClaims} Claims Assessed
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Real-time E&O risk distribution prioritized by legal severity and public record evidence.
          </p>
        </div>

        {/* Global Risk Index Indicator */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-zinc-900/80 border border-zinc-800 font-mono">
            <div className="text-right">
              <span className="block text-[10px] uppercase tracking-wider text-zinc-400">
                Avg Risk Score
              </span>
              <span className={`text-base font-bold ${
                metrics.riskScoreAverage > 65
                  ? "text-red-400"
                  : metrics.riskScoreAverage > 40
                  ? "text-amber-400"
                  : "text-emerald-400"
              }`}>
                {metrics.riskScoreAverage}/100
              </span>
            </div>
          </div>

          {/* Evidence Conflicts Toggle */}
          <button
            id="toggle-evidence-conflicts-btn"
            onClick={onToggleConflictFilter}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono transition-all ${
              evidenceConflictFilter
                ? "bg-amber-950/60 border-amber-500/80 text-amber-200 ring-2 ring-amber-500/20"
                : "bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
            }`}
            title="Filter to claims where public record directly conflicts with screenplay assertion"
          >
            <ShieldAlert className={`w-3.5 h-3.5 ${metrics.evidenceConflictCount > 0 ? "text-amber-400" : "text-zinc-500"}`} />
            <span>
              Conflicts ({metrics.evidenceConflictCount})
            </span>
          </button>
        </div>
      </div>

      {/* Interactive Risk Tier Filter Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-4">
        {/* ALL CLAIMS */}
        <button
          id="filter-all-btn"
          onClick={() => onSelectFilter("ALL")}
          className={`p-3 rounded-xl border text-left transition-all ${
            selectedFilter === "ALL" && !evidenceConflictFilter
              ? "bg-zinc-800/90 border-zinc-600 ring-2 ring-zinc-500/20 shadow-md"
              : "bg-zinc-900/40 border-zinc-800/80 hover:bg-zinc-800/50 hover:border-zinc-700"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-300">All Claims</span>
            <span className="text-xs font-mono font-bold text-zinc-200 px-1.5 py-0.5 rounded bg-zinc-800">
              {metrics.totalClaims}
            </span>
          </div>
          <span className="block text-[11px] text-zinc-400 mt-1 truncate">
            Full screenplay portfolio
          </span>
        </button>

        {/* HIGH-RISK */}
        <button
          id="filter-high-risk-btn"
          onClick={() => onSelectFilter("HIGH-RISK")}
          className={`p-3 rounded-xl border text-left transition-all ${
            selectedFilter === "HIGH-RISK"
              ? "bg-red-950/40 border-red-500/80 ring-2 ring-red-500/20 shadow-md"
              : "bg-zinc-900/40 border-zinc-800/80 hover:bg-red-950/20 hover:border-red-900/50"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <AlertOctagon className="w-3.5 h-3.5 text-red-400" />
              <span className="text-xs font-semibold text-red-300">High Risk</span>
            </div>
            <span className="text-xs font-mono font-bold text-red-300 px-1.5 py-0.5 rounded bg-red-950/60 border border-red-800/40">
              {metrics.highRiskCount}
            </span>
          </div>
          <span className="block text-[11px] text-zinc-400 mt-1 truncate">
            Defamation / Trademark
          </span>
        </button>

        {/* CLEARANCE-REVIEW */}
        <button
          id="filter-clearance-review-btn"
          onClick={() => onSelectFilter("CLEARANCE-REVIEW")}
          className={`p-3 rounded-xl border text-left transition-all ${
            selectedFilter === "CLEARANCE-REVIEW"
              ? "bg-amber-950/40 border-amber-500/80 ring-2 ring-amber-500/20 shadow-md"
              : "bg-zinc-900/40 border-zinc-800/80 hover:bg-amber-950/20 hover:border-amber-900/50"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-semibold text-amber-300">Review</span>
            </div>
            <span className="text-xs font-mono font-bold text-amber-300 px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-800/40">
              {metrics.clearanceReviewCount}
            </span>
          </div>
          <span className="block text-[11px] text-zinc-400 mt-1 truncate">
            Licensing / Music / IP
          </span>
        </button>

        {/* FACTUAL-CONCERN */}
        <button
          id="filter-factual-concern-btn"
          onClick={() => onSelectFilter("FACTUAL-CONCERN")}
          className={`p-3 rounded-xl border text-left transition-all ${
            selectedFilter === "FACTUAL-CONCERN"
              ? "bg-blue-950/40 border-blue-500/80 ring-2 ring-blue-500/20 shadow-md"
              : "bg-zinc-900/40 border-zinc-800/80 hover:bg-blue-950/20 hover:border-blue-900/50"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs font-semibold text-blue-300">Factual</span>
            </div>
            <span className="text-xs font-mono font-bold text-blue-300 px-1.5 py-0.5 rounded bg-blue-950/60 border border-blue-800/40">
              {metrics.factualConcernCount}
            </span>
          </div>
          <span className="block text-[11px] text-zinc-400 mt-1 truncate">
            Record contradiction
          </span>
        </button>

        {/* LOW-RISK */}
        <button
          id="filter-low-risk-btn"
          onClick={() => onSelectFilter("LOW-RISK")}
          className={`p-3 rounded-xl border text-left transition-all ${
            selectedFilter === "LOW-RISK"
              ? "bg-emerald-950/40 border-emerald-500/80 ring-2 ring-emerald-500/20 shadow-md"
              : "bg-zinc-900/40 border-zinc-800/80 hover:bg-emerald-950/20 hover:border-emerald-900/50"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-300">Low Risk</span>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-300 px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/40">
              {metrics.lowRiskCount}
            </span>
          </div>
          <span className="block text-[11px] text-zinc-400 mt-1 truncate">
            Fair use / Uncontested
          </span>
        </button>
      </div>
    </div>
  );
};

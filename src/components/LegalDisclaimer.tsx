import React from "react";
import { ShieldAlert } from "lucide-react";

export const LegalDisclaimer: React.FC<{ compact?: boolean }> = ({ compact }) => {
  if (compact) {
    return (
      <div
        id="legal-disclaimer-compact"
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-950/40 border border-amber-800/40 text-xs text-amber-300/90"
      >
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="truncate">
          AI research & risk screening tool, not legal advice. Final clearance by qualified counsel.
        </span>
      </div>
    );
  }

  return (
    <div
      id="legal-disclaimer-banner"
      className="w-full bg-amber-950/30 border-y border-amber-800/30 px-4 py-2.5 text-xs text-amber-200/90 flex items-center justify-between gap-3 shadow-inner"
    >
      <div className="flex items-center gap-2.5 max-w-5xl mx-auto">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
        <p className="leading-relaxed">
          <strong className="font-semibold text-amber-300">Legal Safety Notice:</strong> Clearance Copilot is an AI-powered research and risk-screening tool, not legal advice. Final clearance and legal decisions should be made by qualified production or legal professionals.
        </p>
      </div>
    </div>
  );
};

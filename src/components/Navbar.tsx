import React from "react";
import { Film, Sparkles, Search, Layers, Activity } from "lucide-react";

interface NavbarProps {
  onLoadDemo: () => void;
  onOpenArch: () => void;
  isAnalyzing: boolean;
  systemStatus: {
    status: string;
    geminiModel: string;
    hasGeminiKey: boolean;
    hasParallelKey: boolean;
  } | null;
}

export const Navbar: React.FC<NavbarProps> = ({
  onLoadDemo,
  onOpenArch,
  isAnalyzing,
  systemStatus,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[#0f1117]/90 backdrop-blur-md border-b border-zinc-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand & Identity */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 via-zinc-800 to-zinc-900 border border-amber-500/40 flex items-center justify-center shadow-lg shadow-amber-500/5">
            <Film className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-zinc-100">
                Clearance Copilot
              </h1>
              <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                Agentic Cinema
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-mono">
              E&O Risk Radar & Public Record Verification
            </p>
          </div>
        </div>

        {/* Runtime Badges & Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Partner & Model Badges */}
          <div className="hidden md:flex items-center gap-2 text-xs font-mono">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900/90 border border-zinc-800 text-zinc-300">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>{systemStatus?.geminiModel || "gemini-3.8-flash"}</span>
            </div>
            <button
              onClick={onOpenArch}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs transition-colors ${
                systemStatus?.hasParallelKey
                  ? "bg-emerald-950/40 border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/40"
                  : "bg-zinc-900/90 border-zinc-800 text-zinc-300 hover:bg-zinc-800"
              }`}
              title="Click to inspect Parallel Search API configuration & test connection"
            >
              <Search
                className={`w-3.5 h-3.5 ${
                  systemStatus?.hasParallelKey ? "text-emerald-400" : "text-amber-400"
                }`}
              />
              <span>Parallel AI Search</span>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  systemStatus?.hasParallelKey
                    ? "bg-emerald-400 animate-pulse"
                    : "bg-amber-400/80"
                }`}
              />
            </button>
          </div>

          {/* Quick Demo Script Button */}
          <button
            id="load-demo-btn"
            onClick={onLoadDemo}
            disabled={isAnalyzing}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm"
            title="Load the pre-configured Scene 42 screenplay with sample legal clearance claims"
          >
            <Film className="w-3.5 h-3.5 text-amber-400" />
            <span>Load Demo Script</span>
          </button>

          {/* Architecture & Compliance Evidence Inspector */}
          <button
            id="view-architecture-btn"
            onClick={onOpenArch}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-amber-500/30 transition-colors flex items-center gap-1.5 shadow-sm"
            title="Inspect Google Cloud Agent Platform runtime, tools, and Devpost compliance evidence"
          >
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Architecture & Evidence</span>
            <span className="sm:hidden">Inspect</span>
          </button>

          {/* Live Health Status Indicator */}
          <div
            id="runtime-health-indicator"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-400"
            title={systemStatus ? "Agent server connected and operational" : "Connecting to backend..."}
          >
            <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span className="hidden lg:inline">Online</span>
          </div>
        </div>
      </div>
    </header>
  );
};

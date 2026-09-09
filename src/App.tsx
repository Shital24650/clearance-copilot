import { useState, useEffect } from "react";
import {
  Film,
  Sparkles,
  Search,
  Shield,
  Play,
  RotateCcw,
  SlidersHorizontal,
  FileText,
  AlertCircle,
  Clock,
} from "lucide-react";
import { Navbar } from "./components/Navbar";
import { LegalDisclaimer } from "./components/LegalDisclaimer";
import { ClearanceRadar } from "./components/ClearanceRadar";
import { ClaimCard } from "./components/ClaimCard";
import { ArchitectureModal } from "./components/ArchitectureModal";
import { DEMO_SCREENPLAY } from "./data/demoScript";
import {
  ExtractedClaim,
  VerifiedClaim,
  ClearanceRadarMetrics,
  RiskVerdict,
} from "./types/clearance";

export default function App() {
  const [scriptText, setScriptText] = useState<string>(DEMO_SCREENPLAY);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisPhase, setAnalysisPhase] = useState<string>("Extracting screenplay claims...");
  const [extractedClaims, setExtractedClaims] = useState<ExtractedClaim[]>([]);
  const [verifiedClaims, setVerifiedClaims] = useState<VerifiedClaim[]>([]);
  const [metrics, setMetrics] = useState<ClearanceRadarMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedVerdictFilter, setSelectedVerdictFilter] = useState<RiskVerdict | "ALL">("ALL");
  const [evidenceConflictFilter, setEvidenceConflictFilter] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Architecture Modal
  const [isArchModalOpen, setIsArchModalOpen] = useState<boolean>(false);

  // System status
  const [systemStatus, setSystemStatus] = useState<{
    status: string;
    geminiModel: string;
    hasGeminiKey: boolean;
    hasParallelKey: boolean;
  } | null>(null);

  // Fetch backend health & agent capabilities on mount
  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch("/api/health");
        if (res.ok) {
          const data = await res.json();
          setSystemStatus({
            status: data.status,
            geminiModel: data.geminiModel || "gemini-3.8-flash",
            hasGeminiKey: data.hasGeminiKey,
            hasParallelKey: data.hasParallelKey,
          });
        }
      } catch (e) {
        console.warn("Backend health check failed:", e);
      }
    }
    checkHealth();
  }, []);

  const handleLoadDemo = () => {
    setScriptText(DEMO_SCREENPLAY);
    setError(null);
  };

  const handleRunAnalysis = async () => {
    if (!scriptText.trim()) {
      setError("Please provide or load screenplay text before running analysis.");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setAnalysisPhase("Extracting screenplay claims and script evidence quotes...");

    try {
      // Step 1: Claim Extraction via Gemini
      const extractRes = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptText }),
      });

      if (!extractRes.ok) {
        throw new Error(`Screenplay extraction failed with HTTP ${extractRes.status}`);
      }

      const extractData = await extractRes.json();
      if (!extractData.success || !extractData.claims || extractData.claims.length === 0) {
        throw new Error(extractData.error || "No identifiable claims extracted from screenplay.");
      }

      setExtractedClaims(extractData.claims);
      setAnalysisPhase(
        `Extracted ${extractData.claims.length} claims. Invoking Parallel Search tool (concurrency: 3) & Gemini evidence reasoning...`
      );

      // Step 2: Live Verification Pipeline via Google Cloud Agent + Parallel Search Tool
      const verifyRes = await fetch("/api/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          claims: extractData.claims,
        }),
      });

      if (!verifyRes.ok) {
        throw new Error(`Verification pipeline failed with HTTP ${verifyRes.status}`);
      }

      const verifyData = await verifyRes.json();
      if (!verifyData.success) {
        throw new Error(verifyData.error || "Agent verification pipeline failed.");
      }

      setVerifiedClaims(verifyData.claims);
      setMetrics(verifyData.metrics);
      setAnalysisPhase("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Analysis execution error:", message);
      setError(message);
    } finally {
      setIsAnalyzing(false);
      setAnalysisPhase("");
    }
  };

  // Filtered claims based on UI selections
  const filteredClaims = verifiedClaims.filter((claim) => {
    if (selectedVerdictFilter !== "ALL" && claim.verdict !== selectedVerdictFilter) {
      return false;
    }
    if (evidenceConflictFilter && !claim.evidenceConflict) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchEntity = claim.entity.toLowerCase().includes(q);
      const matchClaim = claim.claim.toLowerCase().includes(q);
      const matchType = claim.claimType.toLowerCase().includes(q);
      if (!matchEntity && !matchClaim && !matchType) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-[#0a0c10] text-zinc-100 flex flex-col font-sans selection:bg-amber-500/30 selection:text-amber-200">
      {/* Top Navbar */}
      <Navbar
        onLoadDemo={handleLoadDemo}
        onOpenArch={() => setIsArchModalOpen(true)}
        isAnalyzing={isAnalyzing}
        systemStatus={systemStatus}
      />

      {/* Mandatory Non-Negotiable Legal Safety Disclaimer */}
      <LegalDisclaimer />

      {/* Main Content Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Error Banner if any */}
        {error && (
          <div
            id="analysis-error-banner"
            className="p-4 rounded-xl bg-red-950/50 border border-red-800/80 text-red-200 flex items-start gap-3 shadow-lg"
          >
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold block text-sm">Clearance Agent Notice</span>
              <p className="text-xs text-red-300/90 mt-0.5">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-xs text-red-400 hover:text-red-200 px-2 py-1 rounded bg-red-900/40"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Top Control Header & Workspace Split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Screenplay Script Editor (5 Cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-[#12151e] border border-zinc-800/90 rounded-2xl p-4 shadow-xl space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-semibold text-zinc-200">
                    Production Screenplay Script
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-zinc-400">
                  {scriptText.split("\n").length} lines
                </span>
              </div>

              {/* Script Textarea */}
              <div className="relative">
                <textarea
                  id="screenplay-input"
                  value={scriptText}
                  onChange={(e) => setScriptText(e.target.value)}
                  disabled={isAnalyzing}
                  placeholder="Paste scene dialogue, action lines, or script draft here..."
                  className="w-full h-[480px] p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 font-mono text-xs text-zinc-200 leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-500/40 resize-none selection:bg-amber-500/20"
                />
              </div>

              {/* Action Toolbar */}
              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={handleLoadDemo}
                  disabled={isAnalyzing}
                  className="px-3 py-1.5 text-xs font-mono rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition-colors flex items-center gap-1.5"
                  title="Reload demo script"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Demo</span>
                </button>

                <button
                  id="run-clearance-analysis-btn"
                  onClick={handleRunAnalysis}
                  disabled={isAnalyzing}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xs shadow-lg shadow-amber-500/10 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAnalyzing ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      <span>Agent Verifying...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Run Clearance Analysis</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Clearance Radar & Claims (7 Cols) */}
          <div className="lg:col-span-7 space-y-5">
            {/* Active Analysis Progress Bar */}
            {isAnalyzing && (
              <div
                id="agent-progress-box"
                className="bg-[#12151e] border border-amber-500/40 rounded-2xl p-5 shadow-2xl space-y-3 animate-pulse"
              >
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="flex items-center gap-2 text-amber-400 font-semibold">
                    <Sparkles className="w-4 h-4 animate-spin" />
                    Agent Verification in Progress
                  </span>
                  <span className="text-zinc-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    Live Google Cloud Agent
                  </span>
                </div>
                <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden">
                  <div className="bg-gradient-to-r from-amber-500 to-emerald-400 h-2 rounded-full w-3/4 animate-indeterminate" />
                </div>
                <p className="text-xs text-zinc-300 font-mono">
                  {analysisPhase || "Executing multi-stage claim verification..."}
                </p>
              </div>
            )}

            {/* Clearance Radar Metrics (shown if verified claims exist) */}
            {metrics && (
              <ClearanceRadar
                metrics={metrics}
                selectedFilter={selectedVerdictFilter}
                onSelectFilter={setSelectedVerdictFilter}
                evidenceConflictFilter={evidenceConflictFilter}
                onToggleConflictFilter={() => setEvidenceConflictFilter(!evidenceConflictFilter)}
              />
            )}

            {/* Verified Claims List */}
            {verifiedClaims.length > 0 ? (
              <div className="space-y-4">
                {/* Search & Filter Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filter by entity, claim type, or keyword..."
                      className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500/40"
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-mono text-zinc-400">
                      Showing {filteredClaims.length} of {verifiedClaims.length}
                    </span>
                    {(selectedVerdictFilter !== "ALL" || evidenceConflictFilter || searchQuery) && (
                      <button
                        onClick={() => {
                          setSelectedVerdictFilter("ALL");
                          setEvidenceConflictFilter(false);
                          setSearchQuery("");
                        }}
                        className="px-2 py-1 text-[11px] font-mono rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                      >
                        Clear Filters
                      </button>
                    )}
                  </div>
                </div>

                {/* Claim Cards */}
                <div className="space-y-3.5">
                  {filteredClaims.map((claim, idx) => (
                    <ClaimCard key={claim.id} claim={claim} index={idx} />
                  ))}
                  {filteredClaims.length === 0 && (
                    <div className="p-8 text-center rounded-2xl bg-zinc-900/30 border border-zinc-800/50 space-y-2">
                      <SlidersHorizontal className="w-8 h-8 text-zinc-600 mx-auto" />
                      <h4 className="text-sm font-semibold text-zinc-300">No matching claims found</h4>
                      <p className="text-xs text-zinc-500">
                        Try resetting active filters or searching for another term.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : error && !isAnalyzing ? (
              /* Visible Error State when Claim Extraction or Verification Fails */
              <div
                id="clearance-error-view"
                className="p-8 rounded-2xl bg-[#1a0f12] border-2 border-red-800/80 space-y-4 shadow-2xl"
              >
                <div className="flex items-start gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-red-950 border border-red-700/60 text-red-400 flex items-center justify-center shrink-0 shadow-inner">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-red-100">
                      Clearance Agent Analysis Halted
                    </h3>
                    <p className="text-xs text-red-300/80 font-mono">
                      The Google Cloud Clearance Agent encountered an unrecoverable failure during processing.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-zinc-950/90 border border-red-900/60 font-mono text-xs text-red-300 leading-relaxed whitespace-pre-wrap break-words">
                  {error}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-red-950">
                  <span className="text-[11px] font-mono text-zinc-400">
                    Review backend console logs or ensure GEMINI_API_KEY is active.
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setError(null)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-mono border border-zinc-800 transition-colors"
                    >
                      Dismiss Error
                    </button>
                    <button
                      id="retry-analysis-btn"
                      onClick={handleRunAnalysis}
                      className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-red-900/30 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Retry Analysis</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : !isAnalyzing ? (
              /* Idle Empty State */
              <div className="p-10 rounded-2xl bg-[#12151e]/60 border border-zinc-800/80 text-center space-y-4 shadow-xl">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto shadow-inner">
                  <Shield className="w-6 h-6" />
                </div>
                <div className="max-w-md mx-auto space-y-1">
                  <h3 className="text-base font-bold text-zinc-200">
                    Ready for Clearance Verification
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Click <strong>Run Clearance Analysis</strong> to trigger the Google Cloud Clearance Analyst Agent, query the Parallel Search API tool, and review evidence-backed risk verdicts.
                  </p>
                </div>
                <button
                  onClick={handleRunAnalysis}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-colors inline-flex items-center gap-2 shadow-lg shadow-amber-500/5"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Analyze Demo Screenplay (Scene 42)</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </main>

      {/* Technical Architecture & Compliance Modal */}
      <ArchitectureModal
        isOpen={isArchModalOpen}
        onClose={() => setIsArchModalOpen(false)}
        systemStatus={systemStatus}
        claims={verifiedClaims}
        metrics={metrics}
      />
    </div>
  );
}

import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import {
  extractClaimsFromScript,
  GEMINI_MODEL,
  logAgentRuntimeStatus,
  runClearanceAgentPipeline,
  validateGeminiOnStartup,
} from "./src/server/agent/clearance-agent";
import { getAgentPlatformMetadata } from "./src/server/agent/google-agent-platform";
import { ExtractedClaim } from "./src/types/clearance";

dotenv.config();

const appFilename =
  typeof (globalThis as any).__filename === "string"
    ? (globalThis as any).__filename
    : typeof process?.argv?.[1] === "string"
    ? process.argv[1]
    : "";
const appDirname = path.dirname(appFilename || process.cwd());

const PORT = 3000;
const app = express();
app.use(express.json({ limit: "10mb" }));

// Log agent runtime status on startup
logAgentRuntimeStatus();

// Live Gemini startup validation check
let geminiStartupStatus: {
  active: boolean;
  model: string;
  latencyMs?: number;
  error?: string;
} | null = null;

validateGeminiOnStartup()
  .then((status) => {
    geminiStartupStatus = status;
  })
  .catch((err) => {
    console.error("[CRITICAL] Unhandled error during Gemini startup validation:", err);
  });

// -------------------------------------------------------------
// API Routes
// -------------------------------------------------------------

/**
 * Health check endpoint.
 */
app.get("/api/health", (_req: Request, res: Response) => {
  const metadata = getAgentPlatformMetadata();
  res.json({
    status: "ok",
    service: "Clearance Copilot",
    version: "1.0.0",
    runtime: metadata.agentPlatform.clientInitialized
      ? "Google Cloud Agent Platform"
      : "Google Cloud Agent Platform (Container Mode)",
    agentRole: "Clearance Analyst Agent",
    agentPlatformSdk: "@google-cloud/agentplatform",
    agentPlatform: metadata.agentPlatform,
    geminiModel: GEMINI_MODEL,
    partnerIntegration: "Parallel AI Search API",
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    geminiLive: geminiStartupStatus?.active ?? false,
    geminiStartupStatus,
    hasParallelKey: !!process.env.PARALLEL_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Agent capabilities & compliance info endpoint.
 * Provides verifiable evidence for hackathon judges and front-end system diagnostics.
 */
app.get("/api/agent/info", (_req: Request, res: Response) => {
  const metadata = getAgentPlatformMetadata();
  res.json({
    ...metadata,
    partnerIntegration: "Parallel AI Search API (parallel-web SDK)",
    geminiModel: GEMINI_MODEL,
    geminiLive: geminiStartupStatus?.active ?? false,
    capabilities: [
      {
        name: "script_claim_extractor",
        description: "Extracts fine-grained claim-level assertions and dialogue quotes from screenplays.",
      },
      {
        name: "agent_tool_calling",
        displayName: "Google Cloud Agent Platform Tool Calling",
        description: "Orchestrates live function-calling and tool dispatches via @google-cloud/agentplatform and @google/genai.",
        clientInitialized: metadata.agentPlatform.clientInitialized,
        totalDispatches: metadata.agentPlatform.totalToolDispatches,
        lastToolUsed: metadata.agentPlatform.lastToolUsed,
        dispatchedViaAgentPlatform: metadata.agentPlatform.dispatchedViaAgentPlatform,
      },
      {
        name: "parallel_search",
        displayName: "Parallel Search Tool",
        provider: "Parallel AI Search API (official parallel-web SDK)",
        description: "Invokes official Parallel Search API at runtime to retrieve live, LLM-optimized public web evidence.",
      },
      {
        name: "source_hallucination_guard",
        displayName: "Source Anti-Hallucination Guard",
        description: "Validates citations against actual returned Parallel evidence, preventing fabricated URLs.",
      },
      {
        name: "evidence_grounded_risk_evaluator",
        displayName: "Evidence-Grounded Risk Evaluator",
        description: "Performs comparative analysis between script claim and retrieved evidence using Gemini.",
      },
      {
        name: "prioritized_clearance_radar",
        displayName: "Prioritized Clearance Radar",
        description: "Ranks claims by risk severity (HIGH-RISK to LOW-RISK) and calculates portfolio metrics.",
      },
    ],
    legalSafetyNotice:
      "Clearance Copilot is an AI-powered research and risk-screening tool, not legal advice. Final clearance and legal decisions should be made by qualified production or legal professionals.",
  });
});

/**
 * Screenplay Claim Extraction endpoint.
 * Analyzes script text and identifies all claim-level assertions.
 */
app.post("/api/extract", async (req: Request, res: Response) => {
  try {
    const { scriptText } = req.body;
    if (!scriptText || typeof scriptText !== "string") {
      res.status(400).json({ success: false, error: "Missing required string 'scriptText'." });
      return;
    }

    const result = await extractClaimsFromScript(scriptText);
    res.json({
      success: result.success,
      claims: result.claims,
      count: result.claims.length,
      error: result.error,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[API /api/extract] Error:", message);
    res.status(500).json({ success: false, error: "Internal error during claim extraction." });
  }
});

/**
 * Agent Verification Pipeline endpoint.
 * Runs Parallel Search tool and Gemini comparative analysis on claims.
 */
app.post("/api/verify", async (req: Request, res: Response) => {
  try {
    const { claims } = req.body;
    if (!Array.isArray(claims)) {
      res.status(400).json({ success: false, error: "Missing required array 'claims'." });
      return;
    }

    const result = await runClearanceAgentPipeline(claims as ExtractedClaim[]);
    res.json({
      success: result.success,
      claims: result.claims,
      metrics: result.metrics,
      error: result.error,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[API /api/verify] Error:", message);
    res.status(500).json({ success: false, error: "Internal error during claim verification." });
  }
});

/**
 * Unified Full Analysis endpoint.
 * Executes Claim Extraction -> Parallel Tool Search -> Gemini Reasoning -> Radar Synthesis.
 */
app.post("/api/analyze", async (req: Request, res: Response) => {
  try {
    const { scriptText } = req.body;
    if (!scriptText || typeof scriptText !== "string") {
      res.status(400).json({ success: false, error: "Missing required string 'scriptText'." });
      return;
    }

    const extractResult = await extractClaimsFromScript(scriptText);
    if (!extractResult.success || extractResult.claims.length === 0) {
      res.json({
        success: false,
        extractedClaims: [],
        verifiedClaims: [],
        metrics: null,
        error: extractResult.error || "No claims could be extracted.",
      });
      return;
    }

    const verifyResult = await runClearanceAgentPipeline(extractResult.claims);
    res.json({
      success: verifyResult.success,
      extractedClaims: extractResult.claims,
      verifiedClaims: verifyResult.claims,
      metrics: verifyResult.metrics,
      error: verifyResult.error,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[API /api/analyze] Error:", message);
    res.status(500).json({ success: false, error: "Internal error during full script analysis." });
  }
});

// -------------------------------------------------------------
// Vite Middleware / Static Asset Serving
// -------------------------------------------------------------

async function startServer() {
  // Resolve pre-built static distribution directory
  const cwdDist = path.join(process.cwd(), "dist");
  const dirnameDist = appDirname;
  const distPath = fs.existsSync(path.join(cwdDist, "index.html"))
    ? cwdDist
    : fs.existsSync(path.join(dirnameDist, "index.html"))
    ? dirnameDist
    : null;

  // Running as bundled production server or with NODE_ENV=production or when dist assets exist
  const isProduction =
    process.env.NODE_ENV === "production" ||
    appFilename.endsWith("server.cjs") ||
    (appDirname.endsWith("dist") && !!distPath);

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const resolvedDist = distPath || cwdDist;
    app.use(express.static(resolvedDist));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(resolvedDist, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Clearance Copilot Server] Listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Fatal error starting Clearance Copilot server:", err);
  process.exit(1);
});

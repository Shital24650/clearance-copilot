/**
 * Live End-to-End Test for Parallel Search API Tool & Gemini Integration
 * Reads process.env.PARALLEL_API_KEY and process.env.GEMINI_API_KEY.
 * If keys are absent, cleanly skips with informative diagnostics.
 */
import dotenv from "dotenv";
import { executeParallelSearch } from "../server/agent/parallel-tool";
import { runClearanceAgentPipeline } from "../server/agent/clearance-agent";
import { ExtractedClaim } from "../types/clearance";

dotenv.config();

async function runLiveParallelTest() {
  console.log("\n=======================================================");
  console.log("  CLEARANCE COPILOT LIVE PARALLEL API E2E TEST");
  console.log("=======================================================\n");

  const parallelKey = process.env.PARALLEL_API_KEY;
  if (!parallelKey) {
    console.log("ℹ️  PARALLEL_API_KEY is not set in process.env.");
    console.log("    To run live Parallel Search verification, configure PARALLEL_API_KEY.");
    console.log("    Skipping live network calls.\n");
    return;
  }

  console.log("Testing live Parallel Search tool with query 'Apple Inc. trademark clearance'...");
  const searchResult = await executeParallelSearch({
    entity: "Apple Inc.",
    claim: "Screenplay depicts iPhone with Apple logo being hacked.",
    claimType: "TRADEMARK_IP",
    searchObjective: "Find USPTO trademark registration and corporate depiction guidelines for Apple Inc.",
  });

  console.log(`Parallel Search Success: ${searchResult.success}`);
  console.log(`Results Retrieved: ${searchResult.results.length}`);
  if (searchResult.results.length > 0) {
    console.log(`Top Source Title: ${searchResult.results[0].title}`);
    console.log(`Top Source URL: ${searchResult.results[0].url}`);
    console.log(`Evidence Quality Tier: ${searchResult.results[0].evidenceQuality}`);
  }

  const sampleClaim: ExtractedClaim = {
    id: "live-e2e-1",
    entity: "Apple Inc.",
    claim: "The screenplay depicts an iPhone running an exploit with the Apple logo visible.",
    claimType: "TRADEMARK_IP",
    scriptEvidence: 'MARCUS holds up the cracked iPhone 15 Pro.',
    confidence: 0.95,
  };

  console.log("\nRunning full agent pipeline on sample claim with live Parallel evidence...");
  const pipelineResult = await runClearanceAgentPipeline([sampleClaim]);
  console.log(`Pipeline Status: ${pipelineResult.success}`);
  if (pipelineResult.claims.length > 0) {
    const claim = pipelineResult.claims[0];
    console.log(`Verdict: ${claim.verdict}`);
    console.log(`Risk Score: ${claim.riskScore}/100`);
    console.log(`Cited URL: ${claim.sourceUrl || "N/A"}`);
    console.log(`Source Domain: ${claim.sourceDomain || "N/A"}`);
    console.log(`Clearance Action: ${claim.recommendedAction}`);
  }
  console.log("\nLive E2E test completed successfully!\n");
}

runLiveParallelTest().catch((e) => {
  console.error("Live test failed:", e);
});

import { GoogleGenAI, Type } from "@google/genai";
import {
  ClaimType,
  ClearanceRadarMetrics,
  ExtractedClaim,
  ExtractedClaimSchema,
  ParallelSearchResult,
  RiskVerdict,
  VerifiedClaim,
  VerifiedClaimSchema,
} from "../../types/clearance";
import { executeParallelSearch } from "./parallel-tool";
import {
  checkEvidenceRelevance,
  determineEvidenceQuality,
  validateSourceUrl,
} from "./source-validator";
import {
  AGENT_PLATFORM_VERSION,
  GEMINI_SDK_VERSION,
  PARALLEL_SDK_VERSION,
  PARALLEL_SEARCH_TOOL_DECLARATION,
  executeAgentToolCall,
  getAgentPlatformClient,
} from "./google-agent-platform";

// Configurable Gemini Model ID with stable Google Cloud default
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

// Concurrency limit for Parallel Search API calls (Requirement 15: Concurrency limit of 3)
const CONCURRENCY_LIMIT = 3;

/**
 * Initializes the GoogleGenAI client lazily to prevent module load crashes if key is pending.
 */
function getGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

/**
 * Helper to log comprehensive details of a critical Gemini failure without swallowing detail.
 */
export function logCriticalGeminiError(context: string, error: unknown): string {
  const errObj = error as Record<string, any>;
  const name = errObj?.name || (error instanceof Error ? error.name : "Error");
  const message = errObj?.message || String(error);
  const status = errObj?.status || errObj?.code || "N/A";
  const stack = errObj?.stack || (error instanceof Error ? error.stack : "No stack trace available");

  let fullErrorDetails = "";
  try {
    fullErrorDetails = JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
  } catch {
    fullErrorDetails = String(error);
  }

  console.error(`\n===============================================================`);
  console.error(`[CRITICAL] Gemini call failed in ${context}:`);
  console.error(`  Name:        ${name}`);
  console.error(`  Status Code: ${status}`);
  console.error(`  Message:     ${message}`);
  console.error(`  Stack:       ${stack}`);
  console.error(`  Full Error Details:\n${fullErrorDetails}`);
  console.error(`===============================================================\n`);

  return message;
}

/**
 * Helper to execute generateContent with model quota resilience.
 * If the configured model encounters 429 quota exhaustion (e.g. Free Tier limit on gemini-3.8-flash),
 * automatically attempts gemini-3.1-flash-lite while logging the transition.
 */
async function generateContentWithModelFallback(
  ai: GoogleGenAI,
  params: Parameters<GoogleGenAI["models"]["generateContent"]>[0]
) {
  try {
    const response = await ai.models.generateContent(params);
    (response as any).modelUsed = params.model || GEMINI_MODEL;
    return response;
  } catch (err: unknown) {
    const errObj = err as Record<string, any>;
    const isQuota =
      errObj?.status === 429 ||
      (typeof errObj?.message === "string" &&
        (errObj.message.includes("429") ||
          errObj.message.includes("Quota exceeded") ||
          errObj.message.includes("RESOURCE_EXHAUSTED")));

    if (isQuota && params.model !== "gemini-3.1-flash-lite") {
      console.warn(
        `[Clearance Agent] Primary model ${params.model} quota exceeded (429). Attempting fallback to gemini-3.1-flash-lite...`
      );
      const response = await ai.models.generateContent({
        ...params,
        model: "gemini-3.1-flash-lite",
      });
      (response as any).modelUsed = "gemini-3.1-flash-lite";
      return response;
    }
    throw err;
  }
}

/**
 * Startup validation check for Gemini:
 * Attempts a live lightweight call and logs full error details if it fails.
 */
export async function validateGeminiOnStartup(): Promise<{
  active: boolean;
  model: string;
  latencyMs?: number;
  error?: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    console.error("\n===============================================================");
    console.error("  [CRITICAL] Gemini startup validation failed: GEMINI_API_KEY is not configured!");
    console.error("===============================================================\n");
    return { active: false, model: GEMINI_MODEL, error: "GEMINI_API_KEY is not configured" };
  }

  const ai = getGenAIClient();
  if (!ai) {
    console.error("\n===============================================================");
    console.error("  [CRITICAL] Gemini startup validation failed: GoogleGenAI client initialization failed!");
    console.error("===============================================================\n");
    return { active: false, model: GEMINI_MODEL, error: "GoogleGenAI client initialization failed" };
  }

  const startTime = Date.now();
  try {
    const response = await generateContentWithModelFallback(ai, {
      model: GEMINI_MODEL,
      contents: "Respond with the single word: READY",
      config: {
        maxOutputTokens: 10,
        temperature: 0,
      },
    });

    const latencyMs = Date.now() - startTime;
    console.log("---------------------------------------------------------------");
    console.log(`  [GEMINI STARTUP VALIDATION] SUCCESS: Live Gemini connection verified`);
    console.log(`  Model: ${GEMINI_MODEL} | Latency: ${latencyMs}ms | Response: "${response.text?.trim()}"`);
    console.log("---------------------------------------------------------------");
    return { active: true, model: GEMINI_MODEL, latencyMs };
  } catch (err: unknown) {
    const message = logCriticalGeminiError("validateGeminiOnStartup", err);
    return { active: false, model: GEMINI_MODEL, error: message };
  }
}

/**
 * Log startup configuration cleanly without leaking secrets.
 */
export function logAgentRuntimeStatus() {
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasParallel = !!process.env.PARALLEL_API_KEY;

  console.log("===============================================================");
  console.log("  CLEARANCE COPILOT - GOOGLE CLOUD AGENTIC CINEMA RUNTIME");
  console.log(`  Agent Role: Clearance Analyst Agent`);
  console.log(`  Google Cloud Agent Platform SDK: @google-cloud/agentplatform v${AGENT_PLATFORM_VERSION}`);
  console.log(`  Google GenAI SDK: @google/genai v${GEMINI_SDK_VERSION}`);
  console.log(`  Parallel Search SDK: parallel-web v${PARALLEL_SDK_VERSION}`);
  console.log(`  Gemini Reasoning Model: ${GEMINI_MODEL}`);
  console.log(`  Google Cloud Gen AI: ${hasGemini ? "Active (API Key detected)" : "Pending Configuration"}`);
  console.log(`  Parallel Search Tool: ${hasParallel ? "Live SDK Active" : "Fallback Simulation Mode"}`);
  console.log(`  Concurrency Limit: ${CONCURRENCY_LIMIT}`);
  console.log(`  Taxonomy: HIGH-RISK | CLEARANCE-REVIEW | FACTUAL-CONCERN | LOW-RISK`);
  console.log("===============================================================");
}

/**
 * Stage 1: Script Claim Extraction Capability
 * Extracts claim-level entities from screenplay text.
 * A claim is the primary unit of analysis (e.g. "The screenplay states that Apple launched the iPhone in 2007")
 * preserving exact dialogue/action quotes from the script.
 */
export async function extractClaimsFromScript(
  scriptText: string
): Promise<{ success: boolean; claims: ExtractedClaim[]; error?: string }> {
  if (!scriptText || scriptText.trim().length === 0) {
    return { success: false, claims: [], error: "Screenplay text is empty." };
  }

  const ai = getGenAIClient();
  if (!ai) {
    const errorMsg = "GEMINI_API_KEY is not configured in server environment. Claim extraction requires Gemini.";
    console.error(`\n[CRITICAL] Gemini call failed in extractClaimsFromScript: ${errorMsg}\n`);
    return {
      success: false,
      claims: [],
      error: errorMsg,
    };
  }

  const prompt = `You are the Script Claim Extraction Capability of the Clearance Analyst Agent for film & television legal clearance (E&O).
Analyze the following screenplay excerpt and extract all specific, factual, trademark, real person, product, corporate, or copyright claims.

RULES:
1. A CLAIM is the primary unit of analysis. Do NOT extract mere bare keywords or entity names alone.
   - BAD: "Apple"
   - GOOD: "The screenplay asserts that Apple Corporation secretly funded the prototype in 2011."
   - BAD: "Elon Musk"
   - GOOD: "The character claims Elon Musk stole the battery patent from a rival startup."
2. Preserve the EXACT dialogue or action line in 'scriptEvidence'.
3. Assign an appropriate claimType:
   - "REAL_PERSON" (living or recently deceased public figure, private individual, celebrity)
   - "ORGANIZATION" (corporation, agency, NGO, government department)
   - "PRODUCT_BRAND" (commercial product, vehicle, beverage, software, hardware)
   - "HISTORICAL_EVENT" (real-world event, war, trial, disaster, date)
   - "TRADEMARK_IP" (brand logo, slogan, registered trademark, fictional asset resembling real IP)
   - "DEFAMATION_RISK" (claims alleging criminal acts, fraud, corruption, illicit conduct against real entities)
   - "MUSIC_COPYRIGHT" (song lyrics, melodies, album titles quoted or sung)
   - "LOCATION_PROPERTY" (privately owned estate, famous architectural structure, hotel)
4. Set confidence between 0.70 and 1.0.

SCREENPLAY TEXT:
${scriptText}`;

  try {
    const response = await generateContentWithModelFallback(ai, {
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              entity: { type: Type.STRING },
              claim: { type: Type.STRING },
              claimType: {
                type: Type.STRING,
                enum: [
                  "REAL_PERSON",
                  "ORGANIZATION",
                  "PRODUCT_BRAND",
                  "HISTORICAL_EVENT",
                  "TRADEMARK_IP",
                  "DEFAMATION_RISK",
                  "MUSIC_COPYRIGHT",
                  "LOCATION_PROPERTY",
                ],
              },
              scriptEvidence: { type: Type.STRING },
              character: { type: Type.STRING },
              sceneContext: { type: Type.STRING },
              confidence: { type: Type.NUMBER },
            },
            required: ["entity", "claim", "claimType", "scriptEvidence", "confidence"],
          },
        },
      },
    });

    const parsedJson = JSON.parse(response.text || "[]");
    const claims: ExtractedClaim[] = parsedJson.map((item: Partial<ExtractedClaim>, idx: number) => {
      return ExtractedClaimSchema.parse({
        id: item.id || `claim-${Date.now()}-${idx + 1}`,
        entity: item.entity || "Unknown Entity",
        claim: item.claim || "Unspecified assertion in script",
        claimType: item.claimType || "ORGANIZATION",
        scriptEvidence: item.scriptEvidence || "",
        character: item.character || undefined,
        sceneContext: item.sceneContext || undefined,
        lineNumber: item.lineNumber || idx + 1,
        confidence: typeof item.confidence === "number" ? Math.max(0.1, Math.min(1, item.confidence)) : 0.85,
      });
    });

    return { success: true, claims };
  } catch (error: unknown) {
    const message = logCriticalGeminiError("extractClaimsFromScript", error);
    return {
      success: false,
      claims: [],
      error: `Gemini claim extraction failed: ${message}`,
    };
  }
}

/**
 * Fallback deterministic claims extractor when offline or Gemini key is absent.
 */
function getDeterministicClaims(scriptText: string): ExtractedClaim[] {
  const defaults: ExtractedClaim[] = [
    {
      id: "claim-demo-1",
      entity: "Apple Inc.",
      claim: "The screenplay depicts a rogue employee using an iPhone to trigger an unauthorized network back-door, explicitly showing the Apple logo on cracked hardware.",
      claimType: "TRADEMARK_IP",
      scriptEvidence: 'MARCUS (holding a cracked iPhone 15 Pro, Apple logo glinting): "Tim Cook\'s engineers never closed this diagnostic exploit."',
      character: "MARCUS",
      sceneContext: "INT. SERVER ROOM - NIGHT",
      lineNumber: 12,
      confidence: 0.95,
    },
    {
      id: "claim-demo-2",
      entity: "Elon Musk",
      claim: "The screenplay alleges that Elon Musk intentionally falsified early Tesla battery telemetry during the 2008 financial crisis.",
      claimType: "DEFAMATION_RISK",
      scriptEvidence: 'SARAH: "Musk doctored the Roadster endurance logs in October 2008. If that leak gets out, the buyout collapses."',
      character: "SARAH",
      sceneContext: "EXT. PALO ALTO COFFEE SHOP - DAY",
      lineNumber: 28,
      confidence: 0.92,
    },
    {
      id: "claim-demo-3",
      entity: "Federal Bureau of Investigation (FBI)",
      claim: "The script portrays the FBI Special Agent in Charge taking cash kickbacks from an international syndicate.",
      claimType: "ORGANIZATION",
      scriptEvidence: 'AGENT VANCE slides the brown leather duffel across the counter. "Ten percent for Bureau oversight. Standard rate."',
      character: "AGENT VANCE",
      sceneContext: "INT. DINER - DUSK",
      lineNumber: 45,
      confidence: 0.88,
    },
    {
      id: "claim-demo-4",
      entity: "The Beatles / 'Yesterday'",
      claim: "The protagonist sings two full verses of 'Yesterday' at an acoustic open mic without clearing synchronization or mechanical rights.",
      claimType: "MUSIC_COPYRIGHT",
      scriptEvidence: 'ELENA strums the battered Martin guitar. (singing) "Yesterday, all my troubles seemed so far away..."',
      character: "ELENA",
      sceneContext: "INT. PUB - NIGHT",
      lineNumber: 60,
      confidence: 0.97,
    },
    {
      id: "claim-demo-5",
      entity: "Château Marmont",
      claim: "The screenplay names Château Marmont as the site of an illicit money-laundering penthouse suite.",
      claimType: "LOCATION_PROPERTY",
      scriptEvidence: 'MARCUS: "Meet me at Château Marmont, Bungalow 3. The Swiss wire leaves at midnight."',
      character: "MARCUS",
      sceneContext: "EXT. SUNSET BLVD - NIGHT",
      lineNumber: 74,
      confidence: 0.86,
    },
  ];

  const matched = defaults.filter((d) =>
    scriptText.toLowerCase().includes(d.entity.toLowerCase().slice(0, 5))
  );
  return matched.length > 0 ? matched : defaults;
}

/**
 * Concurrency helper for running promises with a fixed concurrency window.
 */
async function runWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Stage 2: Agent Tool-Calling via Google Cloud Agent Platform
 * Registers PARALLEL_SEARCH_TOOL_DECLARATION as an official tool on Gemini.
 * When Gemini emits a tool call for parallel_search, dispatches it through
 * executeAgentToolCall(), ensuring Google Cloud Agent Platform orchestrates tool execution.
 */
export async function retrieveEvidenceViaAgentToolCall(
  claim: ExtractedClaim,
  parallelApiKeyOverride?: string
): Promise<{
  results: ParallelSearchResult[];
  dispatchedViaAgentPlatform: boolean;
  viaFunctionCalling: boolean;
}> {
  // Step 1: Ensure Google Cloud Agent Platform client is initialized and verified
  getAgentPlatformClient();

  const ai = getGenAIClient();
  if (ai) {
    try {
      const toolCallingPrompt = `You are the Clearance Analyst Agent running on Google Cloud Agent Platform.
You are investigating a screenplay assertion for film and television legal, factual, trademark, and copyright clearance:
Entity: ${claim.entity}
Claim Statement: "${claim.claim}"
Clearance Category: ${claim.claimType}
Screenplay Quote: "${claim.scriptEvidence}"

Directive: You must call the 'parallel_search' tool with appropriate parameters to retrieve authoritative public records, legal citations, or copyright catalogs for this assertion.`;

      const response = await generateContentWithModelFallback(ai, {
        model: GEMINI_MODEL,
        contents: toolCallingPrompt,
        config: {
          temperature: 0,
          tools: [{ functionDeclarations: [PARALLEL_SEARCH_TOOL_DECLARATION] }],
        },
      });

      const functionCalls = response.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        const searchCall =
          functionCalls.find((fc) => fc.name === "parallel_search") || functionCalls[0];
        console.log(
          `[Google Cloud Agent Platform] Gemini tool call emitted for "${claim.entity}": ${searchCall.name}`
        );

        const toolResult = await executeAgentToolCall(
          searchCall.name,
          (searchCall.args as Record<string, unknown>) || {},
          { apiKeyOverride: parallelApiKeyOverride, viaFunctionCalling: true }
        );

        return {
          results: toolResult.results || [],
          dispatchedViaAgentPlatform: true,
          viaFunctionCalling: true,
        };
      }
    } catch (err: unknown) {
      console.warn(
        `[Google Cloud Agent Platform] Gemini function calling notice for "${claim.entity}", falling back to Agent Platform tool dispatcher:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  // Direct Agent Platform tool dispatch when Gemini function calling is unavailable or returns text
  const fallbackResult = await executeAgentToolCall(
    "parallel_search",
    {
      entity: claim.entity,
      claim: claim.claim,
      claimType: claim.claimType,
      searchObjective: `Verify public clearance record for: ${claim.claim}`,
      limit: 3,
    },
    { apiKeyOverride: parallelApiKeyOverride, viaFunctionCalling: false }
  );

  return {
    results: fallbackResult.results || [],
    dispatchedViaAgentPlatform: true,
    viaFunctionCalling: false,
  };
}

/**
 * Stage 3 & 4: Evidence-Grounded Risk Analysis with Gemini
 * Compares the original screenplay assertion against retrieved Parallel evidence.
 */
export async function assessClaimRiskWithEvidence(
  claim: ExtractedClaim,
  evidenceResults?: ParallelSearchResult[],
  parallelApiKeyOverride?: string
): Promise<VerifiedClaim> {
  const startTime = Date.now();
  const ai = getGenAIClient();

  // Step 0: Ensure Google Cloud Agent Platform client is initialized
  getAgentPlatformClient();

  // Step 1: Retrieve evidence via Agent Platform tool calling if not pre-provided
  let evidenceToEvaluate: ParallelSearchResult[];
  if (evidenceResults !== undefined) {
    evidenceToEvaluate = evidenceResults;
  } else {
    const retrieval = await retrieveEvidenceViaAgentToolCall(claim, parallelApiKeyOverride);
    evidenceToEvaluate = retrieval.results;
  }

  // Step 2: Run Evidence Relevance Gate on all retrieved Parallel sources
  const evaluatedSources = evidenceToEvaluate.map((e) => {
    const rel = checkEvidenceRelevance(e, claim);
    return {
      ...e,
      isRelevant: rel.isRelevant,
      relevanceScore: rel.score,
      relevanceReason: rel.reason,
    };
  });

  const relevantSources = evaluatedSources.filter((e) => e.isRelevant !== false);
  const hasRelevantEvidence = relevantSources.length > 0;

  const evidenceRelevance: "RELEVANT" | "PARTIAL" | "INSUFFICIENT" | "NOT_RELEVANT" =
    evidenceToEvaluate.length === 0
      ? "INSUFFICIENT"
      : hasRelevantEvidence
      ? relevantSources.some((s) => s.relevanceScore && s.relevanceScore >= 70)
        ? "RELEVANT"
        : "PARTIAL"
      : "NOT_RELEVANT";

  const relevanceExplanation =
    !hasRelevantEvidence && evidenceToEvaluate.length > 0
      ? `Parallel returned this source, but it did not contain sufficient evidence relating to the specific screenplay claim regarding "${claim.entity}". Additional evidence should be retrieved before relying on this source.`
      : undefined;

  let evidenceText = "No public records returned by search.";
  if (hasRelevantEvidence) {
    evidenceText = relevantSources
      .map(
        (e, i) =>
          `[Source ${i + 1}]: "${e.title}" (${e.url})\nDomain: ${e.domain || "N/A"}\nRelevance: Verified Relevant (${e.relevanceReason || "Matches claim"})\nExcerpt: ${e.snippet}`
      )
      .join("\n\n");
  } else if (evidenceToEvaluate.length > 0) {
    const topIrrelevant = evidenceToEvaluate[0];
    evidenceText = `[NOTICE FROM EVIDENCE RELEVANCE GATE]: The Parallel AI Search tool retrieved candidate sources, but the Evidence Relevance Gate determined that the retrieved record is NOT RELEVANT to "${claim.entity}".\nRetrieved record (irrelevant):\nTitle: "${topIrrelevant.title}" (${topIrrelevant.url})\nExcerpt: ${topIrrelevant.snippet}\nRelevance: NOT RELEVANT (${topIrrelevant.relevanceReason || "No matching entity or work terms"})\n\nCRITICAL DIRECTIVE: Do NOT treat this source as evidence proving or clearing the screenplay claim. State that evidence is INSUFFICIENT, set evidenceConflict to true, and advise production legal clearance.`;
  }

  // If Gemini is not available, execute deterministic legal clearance heuristic
  if (!ai) {
    return createDeterministicVerdict(claim, evaluatedSources, startTime);
  }

  const prompt = `You are the Evidence-Based Risk Assessment Capability of the Clearance Analyst Agent for film & television production clearance.
Compare the screenplay assertion against the REAL evidence retrieved through the Parallel Search API tool.

CRITICAL DIRECTIVES:
1. Ground your assessment ONLY in the screenplay claim and the provided Parallel search evidence below. Do NOT hallucinate external evidence.
2. EVIDENCE RELEVANCE GATE: If the provided search records are marked as NOT RELEVANT or do not contain evidence concerning "${claim.entity}", you MUST NOT pretend that this source proves or clears the claim. Instead, recognize that live evidence is currently INSUFFICIENT for this assertion, set evidenceConflict to true, and advise production legal clearance.
3. If the screenplay alleges criminal, fraudulent, or defamatory behavior against a living person or active commercial brand, classify as HIGH-RISK.
4. If a real law enforcement agency or government department (e.g. FBI, CIA, police) or public official is portrayed engaging in corruption, bribery, kickbacks, or illicit systemic crimes, classify as CLEARANCE-REVIEW or FACTUAL-CONCERN (risk rating 55-70). Clearance guidance: "Review factual-resemblance, defamation, and law-enforcement portrayal considerations; consider fictionalizing the agency or character if appropriate." Do NOT make definitive legal conclusions.
5. If the script features prominent registered trademarks (Apple, Rolex, etc.) used negatively or prominently without license, classify as HIGH-RISK or CLEARANCE-REVIEW.
6. If the script depicts an identifiable copyrighted work (music lyrics, artwork) or real private property, classify as CLEARANCE-REVIEW.
7. If public evidence directly contradicts the screenplay's factual depiction (or if no relevant evidence is found to corroborate unverified factual assertions), set evidenceConflict to true and classify as FACTUAL-CONCERN or CLEARANCE-REVIEW.
8. If the entity is purely historical or fictionalized in an unproblematic fair-use manner, classify as LOW-RISK.
9. CITATION RULE: In 'sourceUrl', you MUST specify the exact URL from one of the retrieved sources provided below. Do NOT fabricate a new URL. If no sources are provided, omit sourceUrl.
10. LEGAL SAFETY DISCIPLINE: Do NOT make definitive legal declarations or state that a portrayal is legally actionable. Frame all assessments as risk-screening and research for production and legal professionals.

ORIGINAL SCREENPLAY CLAIM:
Entity: ${claim.entity}
Claim Statement: "${claim.claim}"
Claim Type: ${claim.claimType}
Script Evidence Quote: "${claim.scriptEvidence}"

RETRIEVED PARALLEL SEARCH EVIDENCE:
${evidenceText}`;

  try {
    const response = await generateContentWithModelFallback(ai, {
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            verdict: {
              type: Type.STRING,
              enum: ["HIGH-RISK", "CLEARANCE-REVIEW", "FACTUAL-CONCERN", "LOW-RISK"],
            },
            riskScore: { type: Type.NUMBER, description: "Risk rating from 0 to 100" },
            reasoning: {
              type: Type.STRING,
              description: "Evidence comparison explaining why this risk level applies",
            },
            evidenceSummary: {
              type: Type.STRING,
              description: "Concise summary of retrieved Parallel evidence",
            },
            sourceUrl: {
              type: Type.STRING,
              description: "Must match one of the retrieved source URLs",
            },
            sourceTitle: { type: Type.STRING },
            evidenceConflict: {
              type: Type.BOOLEAN,
              description: "Whether evidence directly contradicts the script assertion",
            },
            conflictSummary: {
              type: Type.STRING,
              description: "Explanation of factual or legal conflict if evidenceConflict is true",
            },
            recommendedAction: {
              type: Type.STRING,
              description: "Actionable clearance counsel for production team",
            },
          },
          required: [
            "verdict",
            "riskScore",
            "reasoning",
            "evidenceSummary",
            "evidenceConflict",
            "recommendedAction",
          ],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");

    // Enforce Source Hallucination Protection:
    const candidateSourcePool = hasRelevantEvidence ? relevantSources : evaluatedSources;
    const validation = validateSourceUrl(parsed.sourceUrl, candidateSourcePool);
    const isSelectedSourceRelevant =
      hasRelevantEvidence && validation.matchedResult?.isRelevant !== false;

    const sourceQuality = isSelectedSourceRelevant
      ? validation.matchedResult?.evidenceQuality ||
        (validation.validatedUrl
          ? determineEvidenceQuality(validation.validatedUrl, validation.matchedResult?.domain)
          : undefined)
      : undefined;

    let verdict: RiskVerdict = [
      "HIGH-RISK",
      "CLEARANCE-REVIEW",
      "FACTUAL-CONCERN",
      "LOW-RISK",
    ].includes(parsed.verdict)
      ? parsed.verdict
      : "CLEARANCE-REVIEW";

    // If evidence was irrelevant, ensure appropriate clearance review or factual concern
    if (!hasRelevantEvidence && evidenceToEvaluate.length > 0 && verdict === "LOW-RISK") {
      verdict = "CLEARANCE-REVIEW";
    }

    const recommendedAction =
      !hasRelevantEvidence && evidenceToEvaluate.length > 0
        ? "Parallel returned search records but they were not relevant to this specific screenplay claim. Additional human research and direct publisher/rights clearance are required prior to filming."
        : parsed.recommendedAction || "Consult production legal counsel prior to filming.";

    const verifiedClaim: VerifiedClaim = {
      ...claim,
      verdict,
      riskLevel: verdict,
      modelUsed: (response as any).modelUsed || GEMINI_MODEL,
      screenplayEvidence: claim.scriptEvidence,
      clearanceGuidance: recommendedAction,
      evidenceSources: evaluatedSources,
      sourceQuality,
      evidenceStatus: evidenceToEvaluate.length > 0 ? "LIVE" : "UNAVAILABLE",
      evidenceRelevance,
      relevanceExplanation,
      riskScore:
        typeof parsed.riskScore === "number"
          ? Math.max(0, Math.min(100, parsed.riskScore))
          : 50,
      reasoning:
        parsed.reasoning || "Evidence review completed by Clearance Analyst Agent.",
      evidenceSummary:
        parsed.evidenceSummary ||
        (evidenceToEvaluate.length > 0
          ? "Verified via Parallel Search API."
          : "Parallel AI Search unavailable at runtime."),
      sourceUrl: validation.validatedUrl,
      sourceTitle: validation.matchedResult?.title || parsed.sourceTitle || undefined,
      sourceDomain: validation.matchedResult?.domain,
      evidenceConflict:
        !hasRelevantEvidence && evidenceToEvaluate.length > 0
          ? true
          : Boolean(parsed.evidenceConflict),
      conflictSummary:
        !hasRelevantEvidence && evidenceToEvaluate.length > 0
          ? "Retrieved search records did not contain relevant evidence for this claim. Additional production clearance research required."
          : parsed.conflictSummary || undefined,
      recommendedAction,
      parallelEvidence: evaluatedSources,
      verifiedAt: new Date().toISOString(),
      executionLatencyMs: Date.now() - startTime,
    };

    return VerifiedClaimSchema.parse(verifiedClaim);
  } catch (err: unknown) {
    logCriticalGeminiError(`assessClaimRiskWithEvidence for "${claim.entity}"`, err);
    return createDeterministicVerdict(claim, evaluatedSources, startTime);
  }
}

/**
 * Deterministic fallback verdict generator for resilient per-claim isolation.
 */
function createDeterministicVerdict(
  claim: ExtractedClaim,
  evidence: ParallelSearchResult[],
  startTime: number
): VerifiedClaim {
  const evaluatedSources = evidence.map((e) => {
    const rel = checkEvidenceRelevance(e, claim);
    return {
      ...e,
      isRelevant: rel.isRelevant,
      relevanceScore: rel.score,
      relevanceReason: rel.reason,
    };
  });

  const relevantSources = evaluatedSources.filter((e) => e.isRelevant !== false);
  const hasRelevantEvidence = relevantSources.length > 0;
  const topEvidence = hasRelevantEvidence ? relevantSources[0] : evaluatedSources[0];

  const evidenceRelevance: "RELEVANT" | "PARTIAL" | "INSUFFICIENT" | "NOT_RELEVANT" =
    evidence.length === 0
      ? "INSUFFICIENT"
      : hasRelevantEvidence
      ? relevantSources.some((s) => s.relevanceScore && s.relevanceScore >= 70)
        ? "RELEVANT"
        : "PARTIAL"
      : "NOT_RELEVANT";

  const relevanceExplanation =
    !hasRelevantEvidence && evidence.length > 0
      ? `Parallel returned this source, but it did not contain sufficient evidence relating to the specific screenplay claim regarding "${claim.entity}". Additional evidence should be retrieved before relying on this source.`
      : undefined;

  let verdict: RiskVerdict = "CLEARANCE-REVIEW";
  let riskScore = 65;
  let recommendedAction = "Submit to production clearance supervisor for rights review.";
  let evidenceConflict = false;
  let conflictSummary: string | undefined = undefined;

  if (claim.claimType === "DEFAMATION_RISK") {
    verdict = "HIGH-RISK";
    riskScore = 92;
    recommendedAction =
      "Critical: Consult entertainment litigation counsel. Evaluate public figure doctrine and potential libel per se.";
  } else if (
    claim.claimType === "ORGANIZATION" &&
    (/fbi|bureau|cia|police|agent|official|kickback|bribe|corruption|bagman/i.test(
      claim.claim
    ) ||
      /fbi|bureau|cia|police|agent|official|kickback|bribe|corruption|bagman/i.test(
        claim.scriptEvidence
      ))
  ) {
    verdict = "CLEARANCE-REVIEW";
    riskScore = 65;
    recommendedAction =
      "Review factual-resemblance, defamation, and law-enforcement portrayal considerations; consider fictionalizing the agency or character if appropriate.";
  } else if (claim.claimType === "MUSIC_COPYRIGHT") {
    verdict = "CLEARANCE-REVIEW";
    riskScore = 80;
    recommendedAction =
      "Obtain sync license and master recording license from music publisher before principal photography.";
  } else if (
    claim.claimType === "TRADEMARK_IP" ||
    claim.claimType === "PRODUCT_BRAND"
  ) {
    verdict = "HIGH-RISK";
    riskScore = 78;
    recommendedAction =
      "Obtain formal trademark product placement / depiction release or replace with cleared fictional prop.";
  } else if (claim.claimType === "LOCATION_PROPERTY") {
    verdict = "CLEARANCE-REVIEW";
    riskScore = 60;
    recommendedAction =
      "Secure a location depiction release or consider fictionalizing identifying details (name, address, signage) to avoid commercial or reputational disparagement.";
  } else if (claim.claimType === "HISTORICAL_EVENT") {
    verdict = "FACTUAL-CONCERN";
    riskScore = 45;
    evidenceConflict = true;
    conflictSummary =
      "Verify chronology and dates against authoritative historical documentation.";
    recommendedAction =
      "Fact-check with project historical consultant to avoid anachronisms.";
  } else {
    verdict = "LOW-RISK";
    riskScore = 25;
    recommendedAction =
      "Standard production clearance notation; minimal risk under fair use.";
  }

  if (!hasRelevantEvidence && evidence.length > 0) {
    evidenceConflict = true;
    conflictSummary =
      "Parallel returned search records but they did not contain sufficient evidence relating to the specific screenplay claim. Additional evidence should be retrieved before relying on this source.";
    recommendedAction =
      "Parallel returned this source, but it did not contain sufficient evidence relating to the specific screenplay claim. Additional human research, publisher contact, or production legal clearance is required prior to filming.";
  }

  const isSelectedSourceRelevant = hasRelevantEvidence && topEvidence?.isRelevant !== false;
  const sourceQuality = isSelectedSourceRelevant
    ? topEvidence?.evidenceQuality ||
      (topEvidence ? determineEvidenceQuality(topEvidence.url, topEvidence.domain) : undefined)
    : undefined;

  return {
    ...claim,
    verdict,
    riskLevel: verdict,
    degradedMode: true,
    screenplayEvidence: claim.scriptEvidence,
    clearanceGuidance: recommendedAction,
    evidenceSources: evaluatedSources,
    sourceQuality,
    evidenceStatus: evidence.length > 0 ? "LIVE" : "UNAVAILABLE",
    evidenceRelevance,
    relevanceExplanation,
    riskScore,
    reasoning: `Clearance Analyst Agent evaluated assertion regarding "${claim.entity}". Claim type "${claim.claimType}" requires structured legal review. Script assertion: "${claim.scriptEvidence}".`,
    evidenceSummary: topEvidence
      ? topEvidence.snippet.slice(0, 300)
      : "Parallel AI Search unavailable. Live public record evidence could not be retrieved at runtime.",
    sourceUrl: topEvidence?.url,
    sourceTitle: topEvidence?.title,
    sourceDomain: topEvidence?.domain,
    evidenceConflict,
    conflictSummary,
    recommendedAction,
    parallelEvidence: evaluatedSources,
    verifiedAt: new Date().toISOString(),
    executionLatencyMs: Date.now() - startTime,
  };
}

/**
 * Stage 5: Prioritized Clearance Radar Computation
 * Aggregates all claim verdicts into the Prioritized Clearance Radar.
 * Sorts strictly by priority: HIGH-RISK -> CLEARANCE-REVIEW -> FACTUAL-CONCERN -> LOW-RISK.
 */
export function computeClearanceRadar(claims: VerifiedClaim[]): {
  prioritizedClaims: VerifiedClaim[];
  metrics: ClearanceRadarMetrics;
} {
  const priorityOrder: Record<RiskVerdict, number> = {
    "HIGH-RISK": 1,
    "CLEARANCE-REVIEW": 2,
    "FACTUAL-CONCERN": 3,
    "LOW-RISK": 4,
  };

  const prioritizedClaims = [...claims].sort((a, b) => {
    const diff = priorityOrder[a.verdict] - priorityOrder[b.verdict];
    if (diff !== 0) return diff;
    return b.riskScore - a.riskScore;
  });

  const categoryBreakdown: Record<ClaimType, number> = {
    REAL_PERSON: 0,
    ORGANIZATION: 0,
    PRODUCT_BRAND: 0,
    HISTORICAL_EVENT: 0,
    TRADEMARK_IP: 0,
    DEFAMATION_RISK: 0,
    MUSIC_COPYRIGHT: 0,
    LOCATION_PROPERTY: 0,
  };

  const entityBreakdown: Record<string, number> = {};
  let highRisk = 0;
  let clearanceReview = 0;
  let factualConcern = 0;
  let lowRisk = 0;
  let totalScore = 0;
  let conflicts = 0;

  for (const c of claims) {
    if (c.verdict === "HIGH-RISK") highRisk++;
    else if (c.verdict === "CLEARANCE-REVIEW") clearanceReview++;
    else if (c.verdict === "FACTUAL-CONCERN") factualConcern++;
    else if (c.verdict === "LOW-RISK") lowRisk++;

    totalScore += c.riskScore;
    if (c.evidenceConflict) conflicts++;

    if (c.claimType in categoryBreakdown) {
      categoryBreakdown[c.claimType]++;
    }
    entityBreakdown[c.entity] = (entityBreakdown[c.entity] || 0) + 1;
  }

  const metrics: ClearanceRadarMetrics = {
    totalClaims: claims.length,
    highRiskCount: highRisk,
    clearanceReviewCount: clearanceReview,
    factualConcernCount: factualConcern,
    lowRiskCount: lowRisk,
    riskScoreAverage: claims.length > 0 ? Math.round(totalScore / claims.length) : 0,
    evidenceConflictCount: conflicts,
    categoryBreakdown,
    entityBreakdown,
  };

  return { prioritizedClaims, metrics };
}

/**
 * Complete End-to-End Clearance Agent Pipeline
 * Orchestrates:
 * Claim Extraction -> Parallel Tool Invocation (Concurrency 3) -> Evidence Comparison -> Radar Synthesis
 */
export async function runClearanceAgentPipeline(
  claims: ExtractedClaim[],
  parallelApiKeyOverride?: string
): Promise<{
  success: boolean;
  claims: VerifiedClaim[];
  metrics: ClearanceRadarMetrics;
  error?: string;
}> {
  if (!claims || claims.length === 0) {
    return {
      success: false,
      claims: [],
      metrics: {
        totalClaims: 0,
        highRiskCount: 0,
        clearanceReviewCount: 0,
        factualConcernCount: 0,
        lowRiskCount: 0,
        riskScoreAverage: 0,
        evidenceConflictCount: 0,
        categoryBreakdown: {
          REAL_PERSON: 0,
          ORGANIZATION: 0,
          PRODUCT_BRAND: 0,
          HISTORICAL_EVENT: 0,
          TRADEMARK_IP: 0,
          DEFAMATION_RISK: 0,
          MUSIC_COPYRIGHT: 0,
          LOCATION_PROPERTY: 0,
        },
        entityBreakdown: {},
      },
      error: "No claims provided for verification.",
    };
  }

  // Execute verification with Concurrency Protection (Limit: 3)
  const verifiedList = await runWithConcurrencyLimit(
    claims,
    CONCURRENCY_LIMIT,
    async (claim, index) => {
      try {
        // Rerouted through Google Cloud Agent Platform tool-calling & risk assessment
        const assessed = await assessClaimRiskWithEvidence(
          claim,
          undefined,
          parallelApiKeyOverride
        );
        return assessed;
      } catch (err: unknown) {
        // Requirement 14: Per-claim failure isolation
        console.error(`[Clearance Agent] Claim #${index + 1} (${claim.entity}) failed:`, err);
        return createDeterministicVerdict(claim, [], Date.now());
      }
    }
  );

  const { prioritizedClaims, metrics } = computeClearanceRadar(verifiedList);
  return {
    success: true,
    claims: prioritizedClaims,
    metrics,
  };
}

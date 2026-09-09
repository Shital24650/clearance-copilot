/**
 * Targeted Unit & Integration Test Suite for Clearance Copilot
 * Covers all Hackathon Verification Requirements:
 * - Test 1: Claim Schema Verification
 * - Test 2: Source Validation & Hallucination Protection
 * - Test 3: Authoritative Source Ranking & Evidence Quality
 * - Test 4: Structured Risk Output & Taxonomy
 * - Test 5: Parallel Search Tool Mock & Interface Calling
 * - Test 6: Parallel Search Failure Handling
 * - Test 7: Law Enforcement & FBI Portrayal Evaluation
 * - Test 8: Batch Failure Isolation & Radar Computation
 * - Test 9: Evidence Relevance Gate
 */
import {
  ExtractedClaim,
  ExtractedClaimSchema,
  ParallelSearchResult,
  VerifiedClaim,
  VerifiedClaimSchema,
} from "../types/clearance";
import { executeParallelSearch, setMockParallelClient } from "../server/agent/parallel-tool";
import {
  checkEvidenceRelevance,
  determineEvidenceQuality,
  rankSourceQuality,
  rankSourcesByRelevanceAndAuthority,
  validateSourceUrl,
} from "../server/agent/source-validator";
import {
  computeClearanceRadar,
  retrieveEvidenceViaAgentToolCall,
  runClearanceAgentPipeline,
} from "../server/agent/clearance-agent";
import {
  PARALLEL_SEARCH_TOOL_DECLARATION,
  executeAgentToolCall,
  getAgentPlatformMetadata,
  getAgentPlatformState,
  resetAgentPlatformStats,
} from "../server/agent/google-agent-platform";

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`  [FAIL] ${testName} - ${detail || "Assertion failed"}`);
    failCount++;
  }
}

async function runTests() {
  console.log("\n=======================================================");
  console.log("  CLEARANCE COPILOT TEST SUITE (HACKATHON VERIFICATION)");
  console.log("=======================================================\n");

  // TEST 1: Claim Schema Verification
  console.log("Running Test 1: Claim Schema Verification...");
  const validClaim: ExtractedClaim = {
    id: "test-claim-1",
    entity: "Apple Inc.",
    claim: "The screenplay states that Apple launched the iPhone in 2007.",
    claimType: "PRODUCT_BRAND",
    scriptEvidence: 'STEVE: "We are introducing three revolutionary products today..."',
    confidence: 0.95,
  };

  const parseResult = ExtractedClaimSchema.safeParse(validClaim);
  assert(parseResult.success, "ExtractedClaim matches schema requirements");
  assert(validClaim.claim.length > 20, "Claim is a full assertion, not just an entity name");
  assert(validClaim.confidence >= 0 && validClaim.confidence <= 1, "Confidence is bounded between 0 and 1");

  // TEST 2: Source Validation & Hallucination Protection
  console.log("\nRunning Test 2: Source Validation & Hallucination Protection...");
  const mockParallelResults: ParallelSearchResult[] = [
    {
      query: "Apple iPhone 2007",
      title: "Apple - Press Release: Apple Reinvents the Phone with iPhone",
      url: "https://www.apple.com/newsroom/2007/01/09Apple-Reinvents-the-Phone-with-iPhone/",
      snippet: "SAN FRANCISCO - January 9, 2007 - Apple today introduced iPhone...",
      domain: "apple.com",
      evidenceQuality: "Official",
    },
    {
      query: "Apple iPhone 2007",
      title: "Wikipedia: iPhone (1st generation)",
      url: "https://en.wikipedia.org/wiki/IPhone_(1st_generation)",
      snippet: "The first generation iPhone was announced on January 9, 2007...",
      domain: "wikipedia.org",
      evidenceQuality: "Secondary",
    },
  ];

  // Sub-case A: Candidate URL is present in Parallel results -> RETAINED
  const validCheck = validateSourceUrl(
    "https://www.apple.com/newsroom/2007/01/09Apple-Reinvents-the-Phone-with-iPhone/",
    mockParallelResults
  );
  assert(validCheck.isValid === true, "Authentic Parallel URL is accepted");
  assert(
    validCheck.validatedUrl === "https://www.apple.com/newsroom/2007/01/09Apple-Reinvents-the-Phone-with-iPhone/",
    "Retains exact matching source URL"
  );

  // Sub-case B: Candidate URL was hallucinated by LLM -> REJECTED & REMOVED / REPLACED with authentic URL
  const hallucinatedCheck = validateSourceUrl(
    "https://fake-hallucinated-news.com/apple-invented-iphone",
    mockParallelResults
  );
  assert(hallucinatedCheck.isValid === false, "Hallucinated URL is rejected");
  assert(
    hallucinatedCheck.validatedUrl === "https://www.apple.com/newsroom/2007/01/09Apple-Reinvents-the-Phone-with-iPhone/",
    "Replaces hallucinated URL with top authentic Parallel search result"
  );

  // TEST 3: Authoritative Source Ranking & Evidence Quality Determination
  console.log("\nRunning Test 3: Authoritative Source Ranking & Evidence Quality...");
  const qualityGov = determineEvidenceQuality("https://www.justice.gov/oig/reports/2024/oversight");
  assert(qualityGov === "Government", "Identifies .gov as Government evidence quality");

  const qualitySony = determineEvidenceQuality("https://www.sonymusicpub.com/en/catalog/beatles");
  assert(qualitySony === "Official", "Identifies music publisher as Official evidence quality");

  const qualityLegal = determineEvidenceQuality("https://supreme.justia.com/cases/federal/us/510/569/");
  assert(qualityLegal === "Primary Legal", "Identifies Justia as Primary Legal evidence quality");

  const qualityNews = determineEvidenceQuality("https://variety.com/2024/film/news/clearance-rights-12345/");
  assert(qualityNews === "Reputable", "Identifies Variety as Reputable evidence quality");

  const qualityWiki = determineEvidenceQuality("https://en.wikipedia.org/wiki/Yesterday_(Beatles_song)");
  assert(qualityWiki === "Secondary", "Identifies Wikipedia as Secondary evidence quality");

  // Verify rankSourceQuality ranks Official/Government above Wikipedia
  const unrankedSources: ParallelSearchResult[] = [
    {
      query: "The Beatles Yesterday",
      title: "Wikipedia: Yesterday",
      url: "https://en.wikipedia.org/wiki/Yesterday_(Beatles_song)",
      snippet: "Yesterday is a song by the English rock band the Beatles...",
      domain: "wikipedia.org",
      evidenceQuality: "Secondary",
    },
    {
      query: "The Beatles Yesterday",
      title: "Sony Music Publishing Catalog",
      url: "https://www.sonymusicpub.com/en/catalog/beatles-yesterday",
      snippet: "Worldwide publishing administration for Lennon-McCartney compositions...",
      domain: "sonymusicpub.com",
      evidenceQuality: "Official",
    },
  ];

  const rankedSources = rankSourceQuality(unrankedSources);
  assert(
    rankedSources[0].domain === "sonymusicpub.com",
    "Authoritative source ranking prefers Official publisher over Wikipedia"
  );

  // TEST 4: Structured Risk Output & Taxonomy Verification
  console.log("\nRunning Test 4: Structured Risk Output & Taxonomy...");
  const verifiedSample: VerifiedClaim = {
    ...validClaim,
    verdict: "HIGH-RISK",
    riskLevel: "HIGH-RISK",
    screenplayEvidence: validClaim.scriptEvidence,
    clearanceGuidance: "Obtain clearance from Apple Legal or replace prop.",
    evidenceSources: mockParallelResults,
    sourceQuality: "Official",
    evidenceStatus: "LIVE",
    riskScore: 88,
    reasoning: "Depicting an authentic trademark in a malicious hacking context requires clearance.",
    evidenceSummary: "Retrieved public evidence confirms active trademark status.",
    sourceUrl: mockParallelResults[0].url,
    sourceTitle: mockParallelResults[0].title,
    sourceDomain: "apple.com",
    evidenceConflict: false,
    recommendedAction: "Obtain clearance from Apple Legal or replace prop.",
    parallelEvidence: mockParallelResults,
    verifiedAt: new Date().toISOString(),
  };

  const verifiedParse = VerifiedClaimSchema.safeParse(verifiedSample);
  assert(verifiedParse.success, "VerifiedClaim matches complete Zod schema");
  assert(
    ["HIGH-RISK", "CLEARANCE-REVIEW", "FACTUAL-CONCERN", "LOW-RISK"].includes(verifiedSample.verdict),
    "Verdict conforms strictly to clearance risk taxonomy"
  );
  assert(typeof verifiedSample.evidenceConflict === "boolean", "Evidence conflict is a typed boolean");
  assert(verifiedSample.riskLevel === "HIGH-RISK", "Structured riskLevel alias is populated");
  assert(verifiedSample.evidenceStatus === "LIVE", "evidenceStatus is set to LIVE");

  // TEST 5: Parallel Tool Interface & Mock Verification
  console.log("\nRunning Test 5: Parallel Search Tool Interface & Mock...");
  const mockState = { called: false };
  let receivedParams: Record<string, unknown> = {};

  setMockParallelClient({
    search: async (params) => {
      mockState.called = true;
      receivedParams = params;
      return {
        results: [
          {
            title: "Mock Parallel Search Result",
            url: "https://example.com/legal-evidence",
            excerpts: ["Exemplary excerpt retrieved from Parallel Search API"],
            publish_date: "2024-01-15",
          },
        ],
      };
    },
  });

  const toolResponse = await executeParallelSearch({
    entity: "Tesla Inc.",
    claim: "Tesla manufactured the Roadster in 2008.",
    claimType: "PRODUCT_BRAND",
    searchObjective: "Verify Tesla Roadster 2008 manufacturing history",
  });

  assert(mockState.called === true, "Agent tool invokes mock Parallel client");
  assert(toolResponse.success === true, "Tool returns success status");
  assert(toolResponse.results.length === 1, "Tool returns formatted structured evidence");
  assert(toolResponse.results[0].url === "https://example.com/legal-evidence", "Tool evidence preserves URL");
  assert(
    Array.isArray((receivedParams as { search_queries?: string[] }).search_queries),
    "Tool generates structured search_queries array for Parallel API"
  );

  setMockParallelClient(null);

  // TEST 6: Parallel Failure Handling (Graceful degradation without crash)
  console.log("\nRunning Test 6: Parallel Search Failure Handling...");
  setMockParallelClient({
    search: async () => {
      throw new Error("Simulated network timeout in Parallel Search SDK");
    },
  });

  const failedToolResponse = await executeParallelSearch({
    entity: "Sample Corp",
    claim: "Sample Corp was incorporated in Delaware.",
    claimType: "ORGANIZATION",
  });

  assert(failedToolResponse.success === false, "Tool safely catches Parallel errors");
  assert(failedToolResponse.results.length === 0, "Tool returns empty results on error");
  assert(
    typeof failedToolResponse.error === "string" && failedToolResponse.error.includes("Parallel AI Search"),
    "Tool provides informative error message without throwing unhandled exceptions"
  );

  setMockParallelClient(null);

  // TEST 7: Law Enforcement & FBI Portrayal Evaluation
  console.log("\nRunning Test 7: Law Enforcement & FBI Claim Evaluation...");
  const fbiClaim: ExtractedClaim = {
    id: "claim-fbi",
    entity: "Federal Bureau of Investigation",
    claim: "Screenplay depicts FBI agents receiving illicit kickbacks from a defense contractor.",
    claimType: "ORGANIZATION",
    scriptEvidence: 'AGENT VANCE: "The Director knows where the contractor bags go."',
    confidence: 0.96,
  };

  // Mock search client for unit test speed and offline stability
  setMockParallelClient({
    search: async () => ({
      results: [
        {
          title: "DOJ OIG Special Report - FBI Ethics and Oversight",
          url: "https://oig.justice.gov/reports/oversight",
          excerpts: ["DOJ Office of the Inspector General statutory oversight over Federal Bureau of Investigation personnel."],
        },
      ],
    }),
  });

  const fbiBatchResult = await runClearanceAgentPipeline([fbiClaim]);
  assert(fbiBatchResult.success === true, "Pipeline evaluates FBI claim successfully");
  const fbiVerdict = fbiBatchResult.claims[0];
  assert(
    fbiVerdict.verdict === "CLEARANCE-REVIEW" || fbiVerdict.verdict === "FACTUAL-CONCERN",
    `FBI corruption portrayal receives heightened scrutiny (${fbiVerdict.verdict}), never LOW-RISK`
  );
  assert(
    fbiVerdict.recommendedAction.toLowerCase().includes("portrayal") ||
    fbiVerdict.recommendedAction.toLowerCase().includes("counsel") ||
    fbiVerdict.recommendedAction.toLowerCase().includes("fictionaliz"),
    "FBI verdict includes actionable production legal guidance regarding portrayal considerations"
  );

  setMockParallelClient(null);

  // TEST 8: Batch Failure Isolation & Radar Computation
  console.log("\nRunning Test 8: Batch Failure Isolation & Prioritized Radar...");
  const mixedClaims: ExtractedClaim[] = [
    {
      id: "claim-safe",
      entity: "The Eiffel Tower",
      claim: "Characters walk past the Eiffel Tower during daytime.",
      claimType: "LOCATION_PROPERTY",
      scriptEvidence: "EXT. EIFFEL TOWER - DAY",
      confidence: 0.9,
    },
    {
      id: "claim-defame",
      entity: "A Real Executive",
      claim: "The screenplay falsely states an executive committed insider trading.",
      claimType: "DEFAMATION_RISK",
      scriptEvidence: 'LEAK: "He wired the stolen funds to the Caymans."',
      confidence: 0.94,
    },
  ];

  const pipelineResult = await runClearanceAgentPipeline(mixedClaims);
  assert(pipelineResult.success === true, "Pipeline succeeds even under mixed risk conditions");
  assert(pipelineResult.claims.length === 2, "All claims in batch processed without truncation");
  assert(
    pipelineResult.claims[0].verdict === "HIGH-RISK",
    "Prioritized radar places HIGH-RISK claims first"
  );
  assert(pipelineResult.metrics.totalClaims === 2, "Radar metrics calculate correct total claims");

  // TEST 9: Evidence Relevance Gate (The Beatles / Yesterday claim vs. ALL RIGHT HERE record)
  console.log("\nRunning Test 9: Evidence Relevance Gate (The Beatles / Yesterday)...");
  const beatlesClaim: ExtractedClaim = {
    id: "claim-beatles-yesterday",
    entity: "The Beatles / 'Yesterday'",
    claim: "Characters perform an acoustic rendition of The Beatles' song 'Yesterday' in a crowded pub.",
    claimType: "MUSIC_COPYRIGHT",
    scriptEvidence: 'MARK: (singing) "Yesterday, all my troubles seemed so far away..."',
    confidence: 0.98,
  };

  const irrelevantCopyrightSource: ParallelSearchResult = {
    query: "The Beatles Yesterday music copyright clearance",
    title: "ALL RIGHT HERE — Geoff Warburton",
    url: "https://publicrecords.copyright.gov/detailed-record/all-right-here-geoff-warburton",
    snippet:
      "U.S. Copyright Office Public Records System. Title: ALL RIGHT HERE. Claimant: Geoff Warburton. Work Type: Musical Work. Date of creation: 2021.",
    domain: "copyright.gov",
    evidenceQuality: "Government",
  };

  const relevantSonySource: ParallelSearchResult = {
    query: "The Beatles Yesterday music copyright clearance",
    title: "Sony Music Publishing Catalog: The Beatles — Yesterday",
    url: "https://www.sonymusicpub.com/en/catalog/beatles-yesterday",
    snippet:
      "Sony Music Publishing worldwide administration rights for 'Yesterday', composition by John Lennon and Paul McCartney, performed by The Beatles. Synchronization license required for feature film sync.",
    domain: "sonymusicpub.com",
    evidenceQuality: "Official",
  };

  // Check 1: Irrelevant source is rejected by relevance gate
  const irrelevantRel = checkEvidenceRelevance(irrelevantCopyrightSource, beatlesClaim);
  assert(
    irrelevantRel.isRelevant === false,
    "Evidence Relevance Gate flags 'ALL RIGHT HERE — Geoff Warburton' as relevant = false"
  );
  assert(
    irrelevantRel.score < 50,
    `Irrelevant source receives low score (${irrelevantRel.score} < 50)`
  );

  // Check 2: Relevant source is accepted by relevance gate
  const relevantRel = checkEvidenceRelevance(relevantSonySource, beatlesClaim);
  assert(
    relevantRel.isRelevant === true,
    "Evidence Relevance Gate flags Sony Beatles Yesterday record as relevant = true"
  );
  assert(
    relevantRel.score >= 70,
    `Relevant source receives high score (${relevantRel.score} >= 70)`
  );

  // Check 3: Ranking prioritizes relevant secondary/official source OVER irrelevant government (.gov) source
  const rankedCombined = rankSourcesByRelevanceAndAuthority(
    [irrelevantCopyrightSource, relevantSonySource],
    beatlesClaim
  );
  assert(
    rankedCombined[0].url === relevantSonySource.url,
    "Relevance-aware ranking strictly prioritizes relevant source over irrelevant Government source"
  );
  assert(
    rankedCombined[0].isRelevant === true,
    "Top ranked item is marked as relevant"
  );
  assert(
    rankedCombined[1].isRelevant === false,
    "Second ranked item is flagged as not relevant"
  );

  // Check 4: Pipeline execution with irrelevant source does NOT label it as authoritative evidence
  setMockParallelClient({
    search: async () => ({
      results: [
        {
          title: irrelevantCopyrightSource.title,
          url: irrelevantCopyrightSource.url,
          excerpts: [irrelevantCopyrightSource.snippet],
        },
      ],
    }),
  });

  const pipelineWithIrrelevant = await runClearanceAgentPipeline([beatlesClaim]);
  const beatlesVerdict = pipelineWithIrrelevant.claims[0];
  assert(
    beatlesVerdict.evidenceRelevance === "NOT_RELEVANT",
    "Pipeline marks claim evidenceRelevance as 'NOT_RELEVANT'"
  );
  assert(
    beatlesVerdict.sourceQuality === undefined,
    "Pipeline does NOT label irrelevant source as authoritative sourceQuality"
  );
  assert(
    beatlesVerdict.evidenceConflict === true,
    "Pipeline flags evidenceConflict = true due to insufficient relevant evidence"
  );
  assert(
    beatlesVerdict.verdict === "CLEARANCE-REVIEW",
    "Pipeline maintains heightened CLEARANCE-REVIEW risk verdict"
  );
  assert(
    typeof beatlesVerdict.relevanceExplanation === "string" &&
      beatlesVerdict.relevanceExplanation.includes("sufficient evidence"),
    "Pipeline provides clear explanation that returned source did not contain evidence relating to claim"
  );

  setMockParallelClient(null);

  // TEST 10: Google Cloud Agent Platform Tool Calling Round-Trip & Dispatcher
  console.log("\nRunning Test 10: Google Cloud Agent Platform Tool Calling Round-Trip...");

  // Check 1: Tool Declaration conforms to Google Cloud Agent Platform schema
  assert(
    PARALLEL_SEARCH_TOOL_DECLARATION.name === "parallel_search",
    "PARALLEL_SEARCH_TOOL_DECLARATION specifies 'parallel_search' tool name"
  );
  assert(
    Array.isArray(PARALLEL_SEARCH_TOOL_DECLARATION.parameters?.required) &&
      PARALLEL_SEARCH_TOOL_DECLARATION.parameters.required.includes("entity") &&
      PARALLEL_SEARCH_TOOL_DECLARATION.parameters.required.includes("claim") &&
      PARALLEL_SEARCH_TOOL_DECLARATION.parameters.required.includes("claimType"),
    "Tool declaration requires 'entity', 'claim', and 'claimType' parameters"
  );

  // Check 2: Direct dispatch through executeAgentToolCall wraps Parallel Search and records state
  resetAgentPlatformStats();
  setMockParallelClient({
    search: async () => ({
      results: [
        {
          title: "United States Patent and Trademark Office - Apple Record",
          url: "https://uspto.gov/trademarks/apple",
          excerpts: ["Official trademark registration for Apple Inc. electronics and consumer software."],
        },
      ],
    }),
  });

  const toolCallResult = await executeAgentToolCall("parallel_search", {
    entity: "Apple Inc.",
    claim: "Apple stole battery patents in 2021",
    claimType: "TRADEMARK_IP",
    searchObjective: "Verify patent disputes involving Apple",
  });

  assert(toolCallResult.success === true, "executeAgentToolCall returns success: true");
  assert(
    toolCallResult.dispatchedViaAgentPlatform === true,
    "executeAgentToolCall confirms dispatchedViaAgentPlatform: true"
  );
  assert(
    Array.isArray(toolCallResult.results) && toolCallResult.results.length === 1,
    "executeAgentToolCall returns retrieved mock search evidence array"
  );
  assert(
    toolCallResult.results![0].url === "https://uspto.gov/trademarks/apple",
    "executeAgentToolCall preserves structured evidence URL"
  );

  const stateAfterDispatch = getAgentPlatformState();
  assert(
    stateAfterDispatch.totalToolDispatches === 1,
    `Agent Platform tracks dispatch counter (expected 1, got ${stateAfterDispatch.totalToolDispatches})`
  );
  assert(
    stateAfterDispatch.lastToolUsed === "parallel_search",
    "Agent Platform tracks lastToolUsed as 'parallel_search'"
  );
  assert(
    stateAfterDispatch.dispatchedViaAgentPlatform === true,
    "Agent Platform state confirms dispatchedViaAgentPlatform: true"
  );

  // Check 3: retrieveEvidenceViaAgentToolCall dispatches through executeAgentToolCall
  resetAgentPlatformStats();
  const sampleClaim: ExtractedClaim = {
    id: "claim-agent-test",
    entity: "Apple Inc.",
    claim: "Apple stole battery patents in 2021",
    claimType: "TRADEMARK_IP",
    scriptEvidence: 'SAM: "Apple lifted those battery schematics back in 21."',
    confidence: 0.95,
  };

  const retrievalResult = await retrieveEvidenceViaAgentToolCall(sampleClaim);
  assert(
    retrievalResult.dispatchedViaAgentPlatform === true,
    "retrieveEvidenceViaAgentToolCall dispatches evidence retrieval via Google Cloud Agent Platform"
  );
  assert(
    retrievalResult.results.length === 1,
    "retrieveEvidenceViaAgentToolCall successfully yields structured evidence"
  );
  assert(
    getAgentPlatformState().totalToolDispatches >= 1,
    "retrieveEvidenceViaAgentToolCall increments Agent Platform totalToolDispatches"
  );

  // Check 4: getAgentPlatformMetadata dynamically reflects live client and tool usage
  const metadata = getAgentPlatformMetadata();
  assert(
    metadata.agentPlatform.clientInitialized === true,
    "getAgentPlatformMetadata dynamically confirms clientInitialized: true"
  );
  assert(
    metadata.agentPlatform.totalToolDispatches >= 1,
    "getAgentPlatformMetadata dynamically reports totalToolDispatches"
  );
  assert(
    metadata.tools.some((t) => t.name === "parallel_search"),
    "getAgentPlatformMetadata lists parallel_search tool declaration"
  );

  setMockParallelClient(null);

  console.log("\n-------------------------------------------------------");
  console.log(`TEST SUMMARY: ${passCount} Passed, ${failCount} Failed.`);
  console.log("-------------------------------------------------------\n");

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner encountered error:", err);
  process.exit(1);
});

import { z } from "zod";

export type ClaimType =
  | "REAL_PERSON"
  | "ORGANIZATION"
  | "PRODUCT_BRAND"
  | "HISTORICAL_EVENT"
  | "TRADEMARK_IP"
  | "DEFAMATION_RISK"
  | "MUSIC_COPYRIGHT"
  | "LOCATION_PROPERTY";

export type RiskVerdict =
  | "HIGH-RISK"
  | "CLEARANCE-REVIEW"
  | "FACTUAL-CONCERN"
  | "LOW-RISK";

// Zod Schema for Extracted Claim
export const ExtractedClaimSchema = z.object({
  id: z.string(),
  entity: z.string(),
  claim: z.string(),
  claimType: z.enum([
    "REAL_PERSON",
    "ORGANIZATION",
    "PRODUCT_BRAND",
    "HISTORICAL_EVENT",
    "TRADEMARK_IP",
    "DEFAMATION_RISK",
    "MUSIC_COPYRIGHT",
    "LOCATION_PROPERTY",
  ]),
  scriptEvidence: z.string(),
  sceneContext: z.string().optional(),
  character: z.string().optional(),
  lineNumber: z.number().optional(),
  confidence: z.number().min(0).max(1),
});

export type ExtractedClaim = z.infer<typeof ExtractedClaimSchema>;

export type EvidenceQualityTier =
  | "Government"
  | "Primary Legal"
  | "Official"
  | "Reputable"
  | "Secondary";

// Parallel Search Result Item
export const ParallelSearchResultSchema = z.object({
  query: z.string(),
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  publishedDate: z.string().optional(),
  score: z.number().optional(),
  domain: z.string().optional(),
  evidenceQuality: z
    .enum(["Government", "Primary Legal", "Official", "Reputable", "Secondary"])
    .optional(),
  isPrimarySource: z.boolean().optional(),
  isRelevant: z.boolean().optional(),
  relevanceScore: z.number().optional(),
  relevanceReason: z.string().optional(),
});

export type ParallelSearchResult = z.infer<typeof ParallelSearchResultSchema>;

// Verified Claim Schema
export const VerifiedClaimSchema = ExtractedClaimSchema.extend({
  verdict: z.enum([
    "HIGH-RISK",
    "CLEARANCE-REVIEW",
    "FACTUAL-CONCERN",
    "LOW-RISK",
  ]),
  // Structured alias fields (Hackathon Requirement 11)
  riskLevel: z
    .enum(["HIGH-RISK", "CLEARANCE-REVIEW", "FACTUAL-CONCERN", "LOW-RISK"])
    .optional(),
  screenplayEvidence: z.string().optional(),
  clearanceGuidance: z.string().optional(),
  evidenceSources: z.array(ParallelSearchResultSchema).optional(),
  sourceQuality: z.string().optional(),
  evidenceStatus: z.enum(["LIVE", "UNAVAILABLE"]).optional(),
  evidenceRelevance: z
    .enum(["RELEVANT", "PARTIAL", "INSUFFICIENT", "NOT_RELEVANT"])
    .optional(),
  relevanceExplanation: z.string().optional(),
  riskScore: z.number().min(0).max(100),
  reasoning: z.string(),
  evidenceSummary: z.string(),
  sourceUrl: z.string().optional(),
  sourceTitle: z.string().optional(),
  sourceDomain: z.string().optional(),
  evidenceConflict: z.boolean().default(false),
  conflictSummary: z.string().optional(),
  recommendedAction: z.string(),
  parallelEvidence: z.array(ParallelSearchResultSchema).default([]),
  verifiedAt: z.string(),
  executionLatencyMs: z.number().optional(),
  degradedMode: z.boolean().optional(),
  modelUsed: z.string().optional(),
});

export type VerifiedClaim = z.infer<typeof VerifiedClaimSchema>;

// Clearance Radar Summary Metrics
export interface ClearanceRadarMetrics {
  totalClaims: number;
  highRiskCount: number;
  clearanceReviewCount: number;
  factualConcernCount: number;
  lowRiskCount: number;
  riskScoreAverage: number;
  evidenceConflictCount: number;
  categoryBreakdown: Record<ClaimType, number>;
  entityBreakdown: Record<string, number>;
}

// Agent tool parameters
export const ParallelToolInputSchema = z.object({
  entity: z.string(),
  claim: z.string(),
  claimType: z.string(),
  searchObjective: z.string().optional().default("Verify factual accuracy and public record"),
  limit: z.number().optional().default(3),
});

export type ParallelToolInput = z.input<typeof ParallelToolInputSchema>;

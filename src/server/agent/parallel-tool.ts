import { Parallel } from "parallel-web";
import {
  ParallelSearchResult,
  ParallelToolInput,
  ParallelToolInputSchema,
} from "../../types/clearance";
import { determineEvidenceQuality, extractDomain, rankSourceQuality } from "./source-validator";

// Mock client type for testing without live API keys
export type ParallelSearchClient = {
  search: (params: {
    objective?: string | null;
    search_queries: string[];
    mode?: "turbo" | "fast" | "basic" | "advanced" | null;
  }) => Promise<{
    results: Array<{
      title?: string | null;
      url: string;
      excerpts: Array<string>;
      publish_date?: string | null;
    }>;
  }>;
};

let customClient: ParallelSearchClient | null = null;

/**
 * Allows injecting a mock Parallel client for unit testing (Test 4 requirement).
 */
export function setMockParallelClient(client: ParallelSearchClient | null) {
  customClient = client;
}

/**
 * Lazily retrieves the official Parallel SDK client using server-side secret handling.
 * Reads PARALLEL_API_KEY strictly from process.env.
 */
export function getParallelClient(apiKeyOverride?: string): ParallelSearchClient | null {
  if (customClient) return customClient;
  const apiKey = (apiKeyOverride && apiKeyOverride.trim()) || process.env.PARALLEL_API_KEY;
  if (!apiKey) {
    return null;
  }
  // Initialize official Parallel TypeScript SDK client
  return new Parallel({ apiKey });
}

/**
 * Executes a live Parallel Search API call for a specific screenplay claim.
 * This tool performs the required live Parallel Search API call via the official parallel-web SDK.
 * It is invoked by the Clearance Analyst Agent to retrieve genuine web evidence
 * for comparing screenplay assertions against the public record.
 */
export async function executeParallelSearch(
  input: ParallelToolInput,
  apiKeyOverride?: string
): Promise<{
  success: boolean;
  query: string;
  results: ParallelSearchResult[];
  error?: string;
  isMock?: boolean;
}> {
  const validated = ParallelToolInputSchema.parse(input);
  const client = getParallelClient(apiKeyOverride);

  // Generate targeted, concise search queries (3-6 words) for the Parallel Search engine
  const primaryQuery = `${validated.entity} ${validated.claimType.replace(/_/g, " ").toLowerCase()} clearance`;

  // Dynamically tailor queries and objectives based on clearance domain
  let searchQueries: string[] = [];
  let objective = validated.searchObjective;

  if (validated.claimType === "MUSIC_COPYRIGHT") {
    const entityParts = validated.entity.split(/[\/\-— ]+/);
    const primaryArtist = entityParts[0]?.trim() || validated.entity;
    const quoteMatch = (validated.claim + " " + validated.entity).match(/["'“‘]([^"'”’]+)["'”’]/);
    const songTitle = quoteMatch ? quoteMatch[1].trim() : entityParts[1]?.trim().replace(/["'“”]/g, "") || "";

    if (songTitle) {
      searchQueries = [
        `"${primaryArtist}" "${songTitle}" copyright music publishing licensing Sony Music Publishing ASCAP BMI`,
        `"${primaryArtist}" "${songTitle}" song copyright ownership rights catalog`,
        `"${songTitle}" ${primaryArtist} music synchronization clearance`,
        primaryQuery,
      ];
      objective =
        objective ||
        `Retrieve authoritative music publishing ownership, copyright catalog registrations, and licensing administration documentation for the song "${songTitle}" by ${primaryArtist}`;
    } else {
      searchQueries = [
        `${validated.entity} copyright ownership music publishing licensing Sony Music Publishing ASCAP BMI`,
        `${validated.entity} rights catalog publishing administration`,
        primaryQuery,
      ];
      objective =
        objective ||
        `Retrieve authoritative music publishing ownership, copyright catalog registrations, and licensing administration documentation for ${validated.entity}`;
    }
  } else if (validated.claimType === "LOCATION_PROPERTY") {
    searchQueries = [
      `${validated.entity} property ownership history commercial filming rights public record`,
      `${validated.entity} hotel commercial trademark public record`,
      primaryQuery,
    ];
    objective =
      objective ||
      `Retrieve official property ownership, commercial depiction rights, and business background documentation for ${validated.entity}`;
  } else if (validated.claimType === "ORGANIZATION") {
    searchQueries = [
      `${validated.entity} official oversight jurisdiction inspector general public record`,
      `${validated.entity} ${validated.claim.slice(0, 80)}`,
      primaryQuery,
    ];
    objective =
      objective ||
      `Retrieve official governmental or organizational public records and regulatory oversight filings for ${validated.entity}`;
  } else if (validated.claimType === "DEFAMATION_RISK") {
    searchQueries = [
      `${validated.entity} official public record lawsuit court filing fact check`,
      `${validated.entity} ${validated.claim.slice(0, 80)}`,
      primaryQuery,
    ];
    objective =
      objective ||
      `Retrieve public legal filings, court records, and verified public documentation for ${validated.entity}`;
  } else if (validated.claimType === "TRADEMARK_IP" || validated.claimType === "PRODUCT_BRAND") {
    searchQueries = [
      `${validated.entity} registered trademark USPTO depiction policy corporate record`,
      `${validated.claim.slice(0, 80)}`,
      primaryQuery,
    ];
    objective =
      objective ||
      `Verify trademark registration status and commercial portrayal guidelines for ${validated.entity}`;
  } else {
    searchQueries = [
      `${validated.entity} ${validated.claim.slice(0, 80)}`,
      primaryQuery,
    ];
    objective = objective || `Verify claim: ${validated.claim} regarding ${validated.entity}`;
  }

  if (!client) {
    // If no live API key is set in current environment, communicate that Parallel is unavailable.
    console.warn(
      `[Parallel Search Tool] Notice: PARALLEL_API_KEY is not configured in server environment.`
    );
    return {
      success: false,
      query: primaryQuery,
      results: [],
      error: "Parallel AI Search unavailable: PARALLEL_API_KEY is not configured in server environment. Live evidence could not be retrieved.",
    };
  }

  try {
    // Perform official Parallel Search API call
    const searchResponse = await client.search({
      objective: objective,
      search_queries: searchQueries,
      mode: "fast",
    });

    const rawResults = searchResponse.results || [];
    const formatted: ParallelSearchResult[] = rawResults.map((item) => {
      const snippet =
        Array.isArray(item.excerpts) && item.excerpts.length > 0
          ? item.excerpts.join(" ... ")
          : "";
      const domain = extractDomain(item.url);
      const evidenceQuality = determineEvidenceQuality(item.url, domain);
      return {
        query: primaryQuery,
        title: item.title || `${validated.entity} Public Reference`,
        url: item.url,
        snippet: snippet.slice(0, 800),
        publishedDate: item.publish_date || undefined,
        domain,
        evidenceQuality,
      };
    });

    // Rank by BOTH relevance and authoritative tiers
    const ranked = rankSourceQuality(formatted, {
      entity: validated.entity,
      claim: validated.claim,
      claimType: validated.claimType,
    }).slice(0, validated.limit || 3);

    if (ranked.length === 0) {
      return {
        success: false,
        query: primaryQuery,
        results: [],
        error: "Parallel AI Search returned no public record results for this query.",
      };
    }

    return {
      success: true,
      query: primaryQuery,
      results: ranked,
      isMock: !!customClient,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Parallel Search Tool] Error querying Parallel API for "${validated.entity}":`, message);
    return {
      success: false,
      query: primaryQuery,
      results: [],
      error: `Parallel AI Search unavailable: ${message}. Live evidence could not be retrieved.`,
    };
  }
}

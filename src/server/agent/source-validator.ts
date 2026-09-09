import { EvidenceQualityTier, ParallelSearchResult } from "../../types/clearance";

/**
 * Validates whether a given URL is present in the actual retrieved Parallel search results.
 * Prevents Gemini from hallucinating or fabricating citation URLs.
 */
export function validateSourceUrl(
  candidateUrl: string | undefined,
  searchResults: ParallelSearchResult[]
): {
  isValid: boolean;
  validatedUrl: string | undefined;
  matchedResult: ParallelSearchResult | undefined;
} {
  if (!candidateUrl || searchResults.length === 0) {
    return { isValid: false, validatedUrl: undefined, matchedResult: undefined };
  }

  const cleanCandidate = candidateUrl.trim().toLowerCase();

  // Find exact or normalized URL match from genuine Parallel search results
  const matched = searchResults.find((res) => {
    const cleanResult = res.url.trim().toLowerCase();
    return (
      cleanResult === cleanCandidate ||
      cleanResult.replace(/\/+$/, "") === cleanCandidate.replace(/\/+$/, "")
    );
  });

  if (matched) {
    return {
      isValid: true,
      validatedUrl: matched.url,
      matchedResult: matched,
    };
  }

  // If Gemini suggested a URL not in Parallel's results, do NOT allow it!
  // Fall back to the highest-ranking genuine Parallel search result.
  const fallback = searchResults[0];
  return {
    isValid: false,
    validatedUrl: fallback ? fallback.url : undefined,
    matchedResult: fallback,
  };
}

/**
 * Extracts and normalizes the domain from a URL.
 */
export function extractDomain(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/**
 * Determines the evidence quality tier based on source domain and path.
 * Adheres strictly to Hackathon Requirements:
 * 1. Government / regulatory / court records (.gov)
 * 2. Primary legal / court filings
 * 3. Official company or organization rights registries
 * 4. Major reputable publications & entertainment trades
 * 5. General secondary reference sources
 */
export function determineEvidenceQuality(
  url: string,
  domain?: string
): EvidenceQualityTier {
  const dom = (domain || extractDomain(url) || "").toLowerCase();

  // Tier 1: Government / regulatory / law enforcement / official oversight
  if (
    dom.endsWith(".gov") ||
    dom.endsWith(".mil") ||
    dom.includes("oig.justice.gov") ||
    dom.includes("justice.gov") ||
    dom.includes("fbi.gov") ||
    dom.includes("copyright.gov") ||
    dom.includes("uspto.gov") ||
    dom.includes("sec.gov") ||
    dom.includes("supremecourt.gov")
  ) {
    return "Government";
  }

  // Tier 2: Primary legal / court filings / statute records
  if (
    dom.includes("justia.com") ||
    dom.includes("casetext.com") ||
    dom.includes("law.cornell.edu") ||
    dom.includes("courtlistener.com") ||
    dom.includes("findlaw.com") ||
    dom.includes("oyez.org") ||
    dom.includes("govinfo.gov")
  ) {
    return "Primary Legal";
  }

  // Tier 3: Official company, publisher, licensing organizations, or institutional bodies
  if (
    dom.includes("sonymusicpub.com") ||
    dom.includes("ascap.com") ||
    dom.includes("bmi.com") ||
    dom.includes("sesac.com") ||
    dom.includes("apple.com") ||
    dom.includes("tesla.com") ||
    dom.includes("chateaumarmont.com") ||
    dom.includes("riaa.com") ||
    dom.includes("mpaa.org") ||
    dom.includes("wipo.int") ||
    dom.includes(".edu")
  ) {
    return "Official";
  }

  // Tier 4: Major reputable news publications & entertainment trades
  if (
    dom.includes("reuters.com") ||
    dom.includes("apnews.com") ||
    dom.includes("bloomberg.com") ||
    dom.includes("wsj.com") ||
    dom.includes("nytimes.com") ||
    dom.includes("variety.com") ||
    dom.includes("hollywoodreporter.com") ||
    dom.includes("deadline.com") ||
    dom.includes("latimes.com") ||
    dom.includes("bbc.com") ||
    dom.includes("npr.org") ||
    dom.includes("forbes.com")
  ) {
    return "Reputable";
  }

  // Tier 5: General secondary reference / Wikipedia
  return "Secondary";
}

/**
 * Numerical weight for sorting evidence authority tiers.
 */
function getTierWeight(tier: EvidenceQualityTier, domain: string): number {
  switch (tier) {
    case "Government":
      return 100;
    case "Official":
      return 85;
    case "Primary Legal":
      return 80;
    case "Reputable":
      return 60;
    case "Secondary":
      // Down-rank Wikipedia relative to primary / official sources
      return domain.includes("wikipedia.org") ? 25 : 35;
    default:
      return 30;
  }
}

/**
 * Generic extraction of key entity and subject terms from a claim and its entity descriptor.
 */
export function extractClaimTargetTerms(claim: {
  entity: string;
  claim: string;
  claimType?: string;
}): {
  entityTerms: string[];
  quotedWorks: string[];
  significantKeywords: string[];
} {
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const stopWords = new Set([
    "the", "a", "an", "and", "or", "in", "on", "at", "to", "for", "with", "of",
    "by", "from", "inc", "corp", "corporation", "company", "llc", "ltd",
    "screenplay", "script", "scene", "character", "protagonist", "depicts",
    "shows", "features", "portrays", "sings", "holding", "says", "claims",
    "without", "clearance", "rights", "two", "full", "verses", "during",
    "about", "into", "that", "this", "these", "those", "their", "there",
  ]);

  // 1. Quoted terms (works, song titles, product names) from entity or claim
  const quotedWorks: string[] = [];
  const quoteRegex = /["'“‘]([^"'”’]{2,50})["'”’]/g;
  let qMatch: RegExpExecArray | null;
  const combinedInput = `${claim.entity} ${claim.claim}`;
  while ((qMatch = quoteRegex.exec(combinedInput)) !== null) {
    const raw = qMatch[1].trim();
    if (raw.length >= 2 && !stopWords.has(raw.toLowerCase())) {
      quotedWorks.push(normalize(raw));
    }
  }

  // 2. Entity parts (split by /, -, (, ))
  const rawEntityParts = claim.entity
    .split(/[\/\-—\(\)]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const entityTerms: string[] = [];
  for (const part of rawEntityParts) {
    const normPart = normalize(part.replace(/["'“”]/g, ""));
    // Add full cleaned entity phrase if meaningful
    if (normPart.length >= 3 && !stopWords.has(normPart)) {
      entityTerms.push(normPart);
    }
    // Also add individual non-stop words
    const tokens = normPart.split(/\s+/);
    for (const t of tokens) {
      if (t.length >= 3 && !stopWords.has(t)) {
        entityTerms.push(t);
      }
    }
  }

  // 3. Significant keywords from claim statement
  const claimWords = normalize(claim.claim)
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !stopWords.has(w));

  return {
    entityTerms: Array.from(new Set(entityTerms)),
    quotedWorks: Array.from(new Set(quotedWorks)),
    significantKeywords: Array.from(new Set(claimWords)),
  };
}

/**
 * Evaluates whether a retrieved Parallel search result is genuinely relevant to the screenplay claim.
 * Implements the Evidence Relevance Gate:
 * A source might have an authentic URL from a government registry (e.g. copyright.gov)
 * or major news site, but if the record describes an unrelated entity or work
 * (e.g. "ALL RIGHT HERE — Geoff Warburton" instead of The Beatles / "Yesterday"),
 * it MUST be flagged as NOT RELEVANT (relevant = false) and NOT used as primary evidence.
 */
export function checkEvidenceRelevance(
  source: ParallelSearchResult,
  claim: { entity: string; claim: string; claimType?: string }
): {
  isRelevant: boolean;
  score: number;
  status: "RELEVANT" | "PARTIAL" | "NOT_RELEVANT";
  reason: string;
} {
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const titleNorm = normalize(source.title || "");
  const snippetNorm = normalize(source.snippet || "");
  const urlNorm = normalize(source.url || "");
  const fullText = `${titleNorm} ${snippetNorm} ${urlNorm}`;

  const { entityTerms, quotedWorks, significantKeywords } = extractClaimTargetTerms(claim);

  let entityMatchCount = 0;
  for (const term of entityTerms) {
    if (fullText.includes(term)) {
      entityMatchCount++;
    }
  }

  let workMatchCount = 0;
  for (const work of quotedWorks) {
    if (fullText.includes(work)) {
      workMatchCount++;
    }
  }

  let keywordMatchCount = 0;
  for (const kw of significantKeywords) {
    if (fullText.includes(kw)) {
      keywordMatchCount++;
    }
  }

  const titleHasEntity = entityTerms.some((t) => titleNorm.includes(t));
  const titleHasWork = quotedWorks.some((w) => titleNorm.includes(w));

  const hasDirectEntityMatch = entityMatchCount > 0;
  const hasDirectWorkMatch = quotedWorks.length > 0 && workMatchCount > 0;

  if (hasDirectEntityMatch && hasDirectWorkMatch) {
    const score = Math.min(100, 75 + (titleHasEntity || titleHasWork ? 15 : 0) + keywordMatchCount * 2);
    return {
      isRelevant: true,
      score,
      status: "RELEVANT",
      reason: "Source directly mentions both the entity and referenced work/subject.",
    };
  }

  if (hasDirectEntityMatch || hasDirectWorkMatch) {
    const score = Math.min(90, 55 + (titleHasEntity || titleHasWork ? 20 : 0) + keywordMatchCount * 2);
    return {
      isRelevant: true,
      score,
      status: "RELEVANT",
      reason: hasDirectEntityMatch
        ? "Source matches the primary entity."
        : "Source matches the referenced work/subject.",
    };
  }

  if (keywordMatchCount >= 3) {
    return {
      isRelevant: true,
      score: 50,
      status: "PARTIAL",
      reason: "Source contains multiple relevant subject keywords but does not name entity directly.",
    };
  }

  // Neither entity, nor work, nor significant keywords matched!
  return {
    isRelevant: false,
    score: 0,
    status: "NOT_RELEVANT",
    reason: `Parallel returned this source, but it did not contain sufficient evidence relating to the specific screenplay claim regarding "${claim.entity}". Additional evidence should be retrieved before relying on this source.`,
  };
}

/**
 * Sorts and prioritizes Parallel search results by BOTH evidence relevance AND source authority.
 * Enforces:
 * 1. Relevant sources are ALWAYS prioritized over irrelevant sources (even if irrelevant has a .gov URL).
 * 2. Among relevant sources, sorts by Authoritative Tier (Government -> Official/Legal -> Reputable -> Secondary).
 * 3. Irrelevant sources are relegated to the bottom and marked isRelevant: false.
 */
export function rankSourcesByRelevanceAndAuthority(
  results: ParallelSearchResult[],
  claim?: { entity: string; claim: string; claimType?: string }
): ParallelSearchResult[] {
  const processed = results.map((item) => {
    const domain = item.domain || extractDomain(item.url) || "";
    const evidenceQuality = item.evidenceQuality || determineEvidenceQuality(item.url, domain);
    if (claim) {
      const rel = checkEvidenceRelevance(item, claim);
      return {
        ...item,
        domain,
        evidenceQuality,
        isRelevant: rel.isRelevant,
        relevanceScore: rel.score,
        relevanceReason: rel.reason,
      };
    }
    return {
      ...item,
      domain,
      evidenceQuality,
      isRelevant: item.isRelevant ?? true,
      relevanceScore: item.relevanceScore ?? 50,
    };
  });

  return processed.sort((a, b) => {
    // 1. Relevance Gate: Relevant sources strictly beat irrelevant sources!
    const relA = a.isRelevant !== false ? 1 : 0;
    const relB = b.isRelevant !== false ? 1 : 0;
    if (relA !== relB) {
      return relB - relA;
    }

    // 2. Authoritative Tier weighting
    const domainA = a.domain || extractDomain(a.url) || "";
    const domainB = b.domain || extractDomain(b.url) || "";
    const tierA = a.evidenceQuality || determineEvidenceQuality(a.url, domainA);
    const tierB = b.evidenceQuality || determineEvidenceQuality(b.url, domainB);
    const weightA = getTierWeight(tierA, domainA);
    const weightB = getTierWeight(tierB, domainB);
    if (weightA !== weightB) {
      return weightB - weightA;
    }

    // 3. Relevance score tiebreaker
    const scoreA = a.relevanceScore || 0;
    const scoreB = b.relevanceScore || 0;
    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }

    return (b.score || 0) - (a.score || 0);
  });
}

/**
 * Backward-compatible rankSourceQuality wrapper.
 */
export function rankSourceQuality(
  results: ParallelSearchResult[],
  claim?: { entity: string; claim: string; claimType?: string }
): ParallelSearchResult[] {
  return rankSourcesByRelevanceAndAuthority(results, claim);
}

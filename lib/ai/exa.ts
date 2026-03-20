import { EnrichmentResult } from '@/types/inbound';

let ExaClass: typeof import('exa-js').default | null = null;

async function getExa() {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return null;
  if (!ExaClass) {
    const mod = await import('exa-js');
    ExaClass = mod.default;
  }
  return new ExaClass(apiKey);
}

export async function enrichDomainFromExa(
  domain: string,
  company?: string
): Promise<EnrichmentResult | null> {
  const exa = await getExa();
  if (!exa) return null;

  try {
    const query = company
      ? `${company} founder CEO startup`
      : `${domain} company founder startup`;

    const result = await exa.searchAndContents(query, {
      numResults: 3,
      highlights: { numSentences: 2 },
      type: 'neural',
      includeDomains: [domain],
    });

    if (!result.results || result.results.length === 0) {
      // Retry without domain restriction
      const broader = await exa.searchAndContents(query, {
        numResults: 3,
        highlights: { numSentences: 2 },
        type: 'neural',
      });
      if (!broader.results || broader.results.length === 0) return null;
      return buildEnrichmentFromResults(broader.results);
    }

    return buildEnrichmentFromResults(result.results);
  } catch (err) {
    console.error('[Exa] Domain enrichment failed:', err);
    return null;
  }
}

function buildEnrichmentFromResults(
  results: Array<{ text?: string | null; highlights?: string[] | null }>
): EnrichmentResult {
  const founderTitles = ['founder', 'co-founder', 'cofounder', 'ceo', 'chief executive'];
  const allText = results
    .map(r => [r.text, ...(r.highlights ?? [])].join(' '))
    .join(' ')
    .toLowerCase();

  const isFounderDetected = founderTitles.some(t => allText.includes(t));

  return {
    atlas_score: isFounderDetected ? 60 : 40,
    email_quality: 0,
    founder_match: isFounderDetected ? 20 : 0,
    contact_identity: 0,
    is_founder_detected: isFounderDetected,
    valid_business_emails: 0,
    valid_free_emails: 0,
    mx_found: false,
    contacts: [],
  };
}

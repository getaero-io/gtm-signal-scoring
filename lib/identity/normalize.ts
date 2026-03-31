// Identity resolution normalization — pure functions, zero dependencies

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);
const PLUS_TAG_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "protonmail.com",
  "proton.me",
  "fastmail.com",
  "fastmail.fm",
]);
const YAHOO_DOMAINS = new Set(["yahoo.com", "ymail.com", "yahoo.co.uk"]);

const LEGAL_SUFFIXES_RE =
  /[,\s]+(inc\.?|llc\.?|ltd\.?|corp\.?|co\.?|gmbh|sa|pty\.?|bv|lp|llp)$/i;

const NAME_SUFFIXES_RE =
  /\b(jr\.?|sr\.?|ii|iii|iv|phd\.?|md\.?|esq\.?)$/i;

const NAME_PREFIXES_RE = /^(mr\.?|mrs\.?|ms\.?|dr\.?)\s+/i;

function isBlank(s: string | null | undefined): s is null | undefined {
  return s == null || s.trim().length === 0;
}

export function normalizeEmail(email: string): string | null {
  if (isBlank(email)) return null;

  const trimmed = email.trim().toLowerCase();
  const atIdx = trimmed.indexOf("@");
  if (atIdx < 1) return null;

  let local = trimmed.slice(0, atIdx);
  let domain = trimmed.slice(atIdx + 1);

  // Canonicalize googlemail → gmail
  if (domain === "googlemail.com") {
    domain = "gmail.com";
  }

  // Strip +tag for supported domains
  if (PLUS_TAG_DOMAINS.has(domain)) {
    const plusIdx = local.indexOf("+");
    if (plusIdx !== -1) local = local.slice(0, plusIdx);
  }

  // Strip -tag for Yahoo
  if (YAHOO_DOMAINS.has(domain)) {
    const dashIdx = local.indexOf("-");
    if (dashIdx !== -1) local = local.slice(0, dashIdx);
  }

  // Strip dots in local part for Gmail/GoogleMail only
  if (GMAIL_DOMAINS.has(domain)) {
    local = local.replace(/\./g, "");
  }

  if (local.length === 0) return null;

  return `${local}@${domain}`;
}

export function normalizeLinkedinUrl(url: string): string | null {
  if (isBlank(url)) return null;

  const trimmed = url.trim().toLowerCase();

  // Match /in/{slug} or /pub/{slug}
  const match = trimmed.match(/linkedin\.com\/(in|pub)\/([^/?#]+)/);
  if (!match) return null;

  const slug = match[2].replace(/\/+$/, "");
  if (slug.length === 0) return null;

  return slug;
}

export function normalizeDomain(domain: string): string | null {
  if (isBlank(domain)) return null;

  let d = domain.trim().toLowerCase();

  // Strip protocol
  d = d.replace(/^https?:\/\//, "");

  // Strip www.
  d = d.replace(/^www\./, "");

  // Strip path, query, fragment
  d = d.split(/[/?#]/)[0];

  // Strip trailing slash (already handled by split, but just in case)
  d = d.replace(/\/+$/, "");

  if (d.length === 0 || !d.includes(".")) return null;

  return d;
}

export function normalizeCompanyName(name: string): string | null {
  if (isBlank(name)) return null;

  let n = name.trim().toLowerCase();

  // Strip legal suffixes (may need multiple passes for "Inc., LLC")
  let prev = "";
  while (prev !== n) {
    prev = n;
    n = n.replace(LEGAL_SUFFIXES_RE, "");
  }

  // & → and
  n = n.replace(/&/g, "and");

  // Strip punctuation (keep alphanumeric and spaces)
  n = n.replace(/[^\w\s]/g, "");

  // Collapse whitespace
  n = n.replace(/\s+/g, " ").trim();

  return n.length === 0 ? null : n;
}

export function normalizePersonName(
  firstName: string | null,
  lastName: string | null
): string | null {
  const parts: string[] = [];

  for (const raw of [firstName, lastName]) {
    if (isBlank(raw)) continue;

    // Lowercase
    let p = raw!.trim().toLowerCase();

    // NFKD decompose + strip combining marks (accents)
    p = p.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

    parts.push(p);
  }

  if (parts.length === 0) return null;

  let full = parts.join(" ");

  // Strip prefixes
  full = full.replace(NAME_PREFIXES_RE, "");

  // Strip suffixes
  full = full.replace(NAME_SUFFIXES_RE, "").trim();

  // Collapse whitespace
  full = full.replace(/\s+/g, " ").trim();

  return full.length === 0 ? null : full;
}

export function makeNameDomainKey(
  firstName: string | null,
  lastName: string | null,
  domain: string | null
): string | null {
  const name = normalizePersonName(firstName, lastName);
  const dom = normalizeDomain(domain ?? "");

  if (name == null || dom == null) return null;

  return `${name}::${dom}`;
}

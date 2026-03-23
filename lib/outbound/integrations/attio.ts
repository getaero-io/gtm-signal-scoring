/**
 * Attio CRM integration client — routes through Deepline unified API.
 *
 * Uses the same Deepline gateway (POST /api/v2/integrations/execute)
 * already used for Apify in qualifier.ts, with provider: "attio".
 *
 * Requires: DEEPLINE_API_KEY env var (shared with other Deepline calls).
 */

const DEEPLINE_API_URL =
  "https://code.deepline.com/api/v2/integrations/execute";

function getDeeplineApiKey(): string {
  const key = process.env.DEEPLINE_API_KEY;
  if (!key) throw new Error("DEEPLINE_API_KEY environment variable is not set");
  return key;
}

interface DeeplineResponse<T = unknown> {
  result: T;
}

interface AttioRecordResult {
  data: {
    id: {
      workspace_id: string;
      object_id: string;
      record_id: string;
    };
    created_at: string;
    values: Record<string, unknown>;
  };
}

async function deeplineAttio<T = unknown>(
  operation: string,
  payload: Record<string, unknown>
): Promise<T> {
  const res = await fetch(DEEPLINE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getDeeplineApiKey()}`,
    },
    body: JSON.stringify({
      provider: "attio",
      operation,
      payload,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "unknown");
    throw new Error(
      `Deepline/Attio error: ${res.status} ${res.statusText} — ${body.slice(0, 300)} (${operation})`
    );
  }

  const json = (await res.json()) as DeeplineResponse<T>;
  return json.result;
}

/**
 * Assert (upsert) a person record in Attio, matching on email_addresses.
 * If a person with the email exists, updates them. Otherwise creates a new record.
 */
export async function upsertAttioPerson(opts: {
  email: string;
  firstName: string;
  lastName: string;
  companyDomain?: string;
  jobTitle?: string;
  linkedinUrl?: string;
  customAttributes?: Record<string, unknown>;
}): Promise<{ recordId: string }> {
  const values: Record<string, unknown> = {
    email_addresses: [{ email_address: opts.email }],
    name: [{ first_name: opts.firstName, last_name: opts.lastName }],
  };

  if (opts.jobTitle) {
    values.job_title = [{ value: opts.jobTitle }];
  }

  if (opts.linkedinUrl) {
    values.linkedin = [{ value: opts.linkedinUrl }];
  }

  if (opts.companyDomain) {
    values.company = [
      {
        target_object: "companies",
        domains: [{ domain: opts.companyDomain }],
      },
    ];
  }

  if (opts.customAttributes) {
    Object.assign(values, opts.customAttributes);
  }

  const result = await deeplineAttio<AttioRecordResult>(
    "attio_assert_record",
    {
      object: "people",
      matching_attribute: "email_addresses",
      data: { values },
    }
  );

  return { recordId: result.data.id.record_id };
}

/**
 * Assert (upsert) a company record in Attio, matching on domains.
 */
export async function upsertAttioCompany(opts: {
  domain: string;
  name: string;
  description?: string;
  customAttributes?: Record<string, unknown>;
}): Promise<{ recordId: string }> {
  const values: Record<string, unknown> = {
    name: [{ value: opts.name }],
    domains: [{ domain: opts.domain }],
  };

  if (opts.description) {
    values.description = [{ value: opts.description }];
  }

  if (opts.customAttributes) {
    Object.assign(values, opts.customAttributes);
  }

  const result = await deeplineAttio<AttioRecordResult>(
    "attio_assert_record",
    {
      object: "companies",
      matching_attribute: "domains",
      data: { values },
    }
  );

  return { recordId: result.data.id.record_id };
}

/**
 * Update specific attributes on an existing person record.
 */
export async function updateAttioPerson(opts: {
  recordId: string;
  updates: Record<string, unknown>;
}): Promise<void> {
  const values: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(opts.updates)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      values[key] = [{ value }];
    } else {
      values[key] = value;
    }
  }

  await deeplineAttio("attio_update_record", {
    object: "people",
    record_id: opts.recordId,
    data: { values },
  });
}

/**
 * Search for records in Attio by query string.
 */
export async function searchAttioRecords(opts: {
  object: "people" | "companies";
  query: string;
}): Promise<AttioRecordResult[]> {
  const result = await deeplineAttio<{ data: AttioRecordResult[] }>(
    "attio_search_records",
    {
      object: opts.object,
      query: opts.query,
    }
  );

  return result.data ?? [];
}

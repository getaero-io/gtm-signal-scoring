export interface RelayResult {
  successes: number;
  failures: number;
  errors: string[];
}

/**
 * Relay a webhook payload to one or more target URLs.
 * Uses Promise.allSettled so one failure never blocks others.
 * Fire-and-forget from the caller's perspective — failures are counted but never thrown.
 */
export async function relayWebhook(
  payload: unknown,
  source: string,
  targets: string[]
): Promise<RelayResult> {
  if (targets.length === 0) {
    return { successes: 0, failures: 0, errors: [] };
  }

  const body = JSON.stringify(payload);

  const results = await Promise.allSettled(
    targets.map(async (target) => {
      const url = new URL(target);
      url.searchParams.set("source", source);

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (!response.ok) {
        throw new Error(
          `Relay to ${target} failed: ${response.status} ${response.statusText}`
        );
      }
    })
  );

  let successes = 0;
  let failures = 0;
  const errors: string[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      successes++;
    } else {
      failures++;
      errors.push(result.reason?.message ?? String(result.reason));
    }
  }

  return { successes, failures, errors };
}

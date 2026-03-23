import { WebClient } from "@slack/web-api";

let client: WebClient | null = null;

export function getSlackClient(): WebClient {
  if (!client) {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) throw new Error("SLACK_BOT_TOKEN env var is required");
    client = new WebClient(token);
  }
  return client;
}

export async function postMessage(opts: {
  channel: string;
  text: string;
  blocks?: unknown[];
}): Promise<{ ts: string; channel: string }> {
  const slack = getSlackClient();
  const result = await slack.chat.postMessage({
    channel: opts.channel,
    text: opts.text,
    blocks: opts.blocks as any,
  });
  return { ts: result.ts!, channel: result.channel! };
}

export async function updateMessage(opts: {
  channel: string;
  ts: string;
  text: string;
  blocks?: unknown[];
}): Promise<void> {
  const slack = getSlackClient();
  await slack.chat.update({
    channel: opts.channel,
    ts: opts.ts,
    text: opts.text,
    blocks: opts.blocks as any,
  });
}

export async function postThreadReply(opts: {
  channel: string;
  threadTs: string;
  text: string;
}): Promise<void> {
  const slack = getSlackClient();
  await slack.chat.postMessage({
    channel: opts.channel,
    thread_ts: opts.threadTs,
    text: opts.text,
  });
}

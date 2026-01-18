// Shared helpers for Vercel Serverless Functions (Node runtime)

export const AUTHOR = "@Dafidxcode";
export const PAXSENIX_BASE_URL = "https://api.paxsenix.org";

export const DEFAULT_POLL_INTERVAL_MS = 5000;
export const DEFAULT_TIMEOUT_MS = 300000; // 5 minutes

export function json(res: any, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export function normalizeAuthor(payload: any) {
  if (!payload || typeof payload !== "object") return payload;
  const { creator, ...rest } = payload;
  return { Author: AUTHOR, ...rest };
}

export async function readJsonBody(req: any) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON body");
  }
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function getApiKey() {
  const key = process.env.PAXSENIX_API_KEY;
  if (!key) throw new Error("Missing env PAXSENIX_API_KEY");
  return key;
}

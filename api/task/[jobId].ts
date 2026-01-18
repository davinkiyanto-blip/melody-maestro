import { getApiKey, json, normalizeAuthor, PAXSENIX_BASE_URL } from "../_utils";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return json(res, 405, normalizeAuthor({ ok: false, message: "Method not allowed" }));

  try {
    const jobId = req.query?.jobId;
    if (!jobId || typeof jobId !== "string") {
      return json(res, 400, normalizeAuthor({ ok: false, message: "jobId is required" }));
    }

    const apiKey = getApiKey();

    const upstream = await fetch(`${PAXSENIX_BASE_URL}/task/${encodeURIComponent(jobId)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const data = await upstream.json().catch(() => null);

    if (!upstream.ok) {
      return json(
        res,
        502,
        normalizeAuthor({ ok: false, message: "Upstream error", status: upstream.status, upstream: data })
      );
    }

    return json(res, 200, normalizeAuthor(data));
  } catch (e: any) {
    return json(res, 500, normalizeAuthor({ ok: false, message: e?.message ?? "Internal error" }));
  }
}

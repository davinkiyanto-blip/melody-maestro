import { z } from "zod";
import {
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_TIMEOUT_MS,
  getApiKey,
  json,
  normalizeAuthor,
  PAXSENIX_BASE_URL,
  readJsonBody,
  sleep,
} from "../../../_utils";

const Models = ["V3_5", "V4", "V4_5", "V4_5PLUS", "V5"] as const;

type Model = (typeof Models)[number];

const requestSchema = z
  .object({
    customMode: z.boolean(),
    instrumental: z.boolean().optional().default(false),
    title: z.string().optional().default(""),
    style: z.string().optional().default(""),
    prompt: z.string().optional().default(""),
    model: z.enum(Models).optional().default("V5"),
    negativeTags: z.string().optional().default(""),
  })
  .superRefine((v, ctx) => {
    if (v.customMode === false) {
      if (!v.prompt?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "prompt is required when customMode=false" });
      }
      if ((v.prompt ?? "").length > 400) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "prompt max length is 400 when customMode=false" });
      }
      return;
    }

    const style = v.style?.trim();
    const title = v.title?.trim();
    const prompt = v.prompt?.trim();

    if (!title) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "title is required when customMode=true" });
    if (!style) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "style is required when customMode=true" });
    if (v.instrumental === false && !prompt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "prompt is required when customMode=true and instrumental=false",
      });
    }

    if ((v.title ?? "").length > 80) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "title max length is 80" });
    }

    const model: Model = (v.model ?? "V5") as Model;
    const isV35orV4 = model === "V3_5" || model === "V4";
    const promptLimit = isV35orV4 ? 3000 : 5000;
    const styleLimit = isV35orV4 ? 200 : 1000;

    if ((v.prompt ?? "").length > promptLimit) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `prompt max length is ${promptLimit} for model ${model}` });
    }

    if ((v.style ?? "").length > styleLimit) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `style max length is ${styleLimit} for model ${model}` });
    }
  });

function parseTimeoutMs(req: any) {
  const raw = req.query?.timeoutMs ?? req.query?.timeout ?? undefined;
  if (raw == null) return DEFAULT_TIMEOUT_MS;
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(n, 15 * 60 * 1000); // hard cap 15 minutes
}

function parsePollIntervalMs(req: any) {
  const raw = req.query?.pollIntervalMs ?? req.query?.poll ?? undefined;
  if (raw == null) return DEFAULT_POLL_INTERVAL_MS;
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(n) || n < 1000) return DEFAULT_POLL_INTERVAL_MS;
  return Math.min(n, 30000);
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, normalizeAuthor({ ok: false, message: "Method not allowed" }));

  const timeoutMs = parseTimeoutMs(req);
  const pollIntervalMs = parsePollIntervalMs(req);

  try {
    const body = await readJsonBody(req);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return json(
        res,
        400,
        normalizeAuthor({ ok: false, message: "Invalid request", errors: parsed.error.flatten() })
      );
    }

    const payloadToUpstream = parsed.data.customMode
      ? parsed.data
      : {
          customMode: false,
          prompt: parsed.data.prompt,
          instrumental: false,
          title: "",
          style: "",
          model: "",
          negativeTags: "",
        };

    const apiKey = getApiKey();

    // 1) Start job
    const startResp = await fetch(`${PAXSENIX_BASE_URL}/ai-music/suno-music`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payloadToUpstream),
    });

    const startJson = await startResp.json().catch(() => null);

    if (!startResp.ok || !startJson?.jobId) {
      return json(
        res,
        502,
        normalizeAuthor({ ok: false, message: "Upstream start job failed", status: startResp.status, upstream: startJson })
      );
    }

    const jobId = startJson.jobId as string;
    const taskUrl = startJson.task_url || `${PAXSENIX_BASE_URL}/task/${jobId}`;

    // 2) Poll until done/timeout
    const startedAt = Date.now();
    let last: any = null;

    while (Date.now() - startedAt < timeoutMs) {
      const statusResp = await fetch(taskUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      const statusJson = await statusResp.json().catch(() => null);
      last = statusJson;

      if (statusJson?.status === "done" && statusJson?.ok === true) {
        return json(res, 200, normalizeAuthor(statusJson));
      }

      await sleep(pollIntervalMs);
    }

    return json(
      res,
      408,
      normalizeAuthor({
        ok: false,
        status: last?.status ?? "unknown",
        message: "Timeout waiting for music generation to finish",
        jobId,
        task_url: taskUrl,
        lastResponse: last,
      })
    );
  } catch (e: any) {
    return json(res, 500, normalizeAuthor({ ok: false, message: e?.message ?? "Internal error" }));
  }
}

import { z } from "zod";
import {
  getApiKey,
  json,
  normalizeAuthor,
  PAXSENIX_BASE_URL,
  readJsonBody,
} from "../../_utils";

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
    // Non-custom mode: only prompt required, max 400 chars
    if (v.customMode === false) {
      if (!v.prompt?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "prompt is required when customMode=false" });
      }
      if ((v.prompt ?? "").length > 400) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "prompt max length is 400 when customMode=false" });
      }
      return;
    }

    // Custom mode requirements
    const style = v.style?.trim();
    const title = v.title?.trim();
    const prompt = v.prompt?.trim();

    if (!title) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "title is required when customMode=true" });
    }
    if (!style) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "style is required when customMode=true" });
    }

    if (v.instrumental === false && !prompt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "prompt is required when customMode=true and instrumental=false" });
    }

    // Title length
    if ((v.title ?? "").length > 80) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "title max length is 80" });
    }

    // Model-based limits
    const model: Model = (v.model ?? "V5") as Model;

    const isV35orV4 = model === "V3_5" || model === "V4";
    const promptLimit = isV35orV4 ? 3000 : 5000;
    const styleLimit = isV35orV4 ? 200 : 1000;

    if ((v.prompt ?? "").length > promptLimit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `prompt max length is ${promptLimit} for model ${model}`,
      });
    }

    if ((v.style ?? "").length > styleLimit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `style max length is ${styleLimit} for model ${model}`,
      });
    }
  });

export default async function handler(req: any, res: any) {
  // Basic CORS for browser-based callers (safe for server-to-server too)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, normalizeAuthor({ ok: false, message: "Method not allowed" }));

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

    // If non-customMode, enforce that other fields are empty per requirement
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

    const upstream = await fetch(`${PAXSENIX_BASE_URL}/ai-music/suno-music`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payloadToUpstream),
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

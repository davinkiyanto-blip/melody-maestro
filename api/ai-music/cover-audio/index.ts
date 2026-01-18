import { z } from "zod";
import { getKieApiKey, json, normalizeAuthor, readJsonBody, KIE_SUNO_UPLOAD_COVER_URL } from "../../_utils";

const Models = ["V4", "V4_5", "V4_5PLUS", "V4_5ALL", "V5"] as const;

function getBaseUrl(req: any) {
  const proto = (req.headers?.["x-forwarded-proto"] as string) || "https";
  const host = (req.headers?.["x-forwarded-host"] as string) || (req.headers?.host as string);
  return `${proto}://${host}`;
}

const requestSchema = z.object({
  uploadUrl: z.string().url(),
  callBackUrl: z.string().url().optional(),
  prompt: z.string().optional().default(""),
  customMode: z.boolean(),
  instrumental: z.boolean().optional().default(true),
  model: z.enum(Models).optional().default("V5"),
  style: z.string().optional().default(""),
  title: z.string().optional().default(""),
  negativeTags: z.string().optional().default(""),

  vocalGender: z.enum(["m", "f"]).optional(),
  styleWeight: z.number().optional(),
  weirdnessConstraint: z.number().optional(),
  audioWeight: z.number().optional(),
  personaId: z.string().optional(),
});

export default async function handler(req: any, res: any) {
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

    // KIE membutuhkan callBackUrl; default ke endpoint callback kita
    const callBackUrl =
      parsed.data.callBackUrl || `${getBaseUrl(req)}/api/ai-music/cover-audio/callback`;

    // Minimal rules from docs: when customMode=true, style & title required.
    if (parsed.data.customMode === true) {
      if (!parsed.data.style.trim() || !parsed.data.title.trim()) {
        return json(
          res,
          400,
          normalizeAuthor({
            ok: false,
            message: "style & title wajib saat customMode=true",
          })
        );
      }
    }

    const key = getKieApiKey();

    const upstream = await fetch(KIE_SUNO_UPLOAD_COVER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        ...parsed.data,
        callBackUrl,
      }),
    });

    const data = await upstream.json().catch(() => null);

    if (!upstream.ok) {
      return json(
        res,
        502,
        normalizeAuthor({ ok: false, message: "Upstream error", status: upstream.status, upstream: data })
      );
    }

    return json(
      res,
      200,
      normalizeAuthor({
        ok: true,
        provider: "kie",
        callBackUrl,
        ...data,
      })
    );
  } catch (e: any) {
    return json(res, 500, normalizeAuthor({ ok: false, message: e?.message ?? "Internal error" }));
  }
}

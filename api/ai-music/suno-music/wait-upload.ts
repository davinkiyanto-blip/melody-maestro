import { z } from "zod";
import {
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_TIMEOUT_MS,
  getApiKey,
  getKieApiKey,
  json,
  normalizeAuthor,
  PAXSENIX_BASE_URL,
  readJsonBody,
  sleep,
  KIE_FILE_UPLOAD_URL,
} from "../../../_utils";

const Models = ["V3_5", "V4", "V4_5", "V4_5PLUS", "V5"] as const;

type Model = (typeof Models)[number];

type PaxRecord = {
  id?: string | number;
  audio_url?: string;
  image_url?: string;
  duration?: number;
  [k: string]: unknown;
};

type KieUploadResult = {
  success: boolean;
  code?: number;
  msg?: string;
  data?: {
    fileName?: string;
    filePath?: string;
    downloadUrl?: string;
    fileSize?: number; // bytes
    mimeType?: string;
    uploadedAt?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

const requestSchema = z
  .object({
    // paxsenix params
    customMode: z.boolean(),
    instrumental: z.boolean().optional().default(false),
    title: z.string().optional().default(""),
    style: z.string().optional().default(""),
    prompt: z.string().optional().default(""),
    model: z.enum(Models).optional().default("V5"),
    negativeTags: z.string().optional().default(""),

    // kie upload options
    kieUploadPath: z.string().optional().default("music/paxsenix"),
    kieFileName: z.string().optional().default(""),
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

    if (!v.kieUploadPath?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "kieUploadPath is required" });
    }
  });

function parseTimeoutMs(req: any) {
  const raw = req.query?.timeoutMs ?? req.query?.timeout ?? undefined;
  if (raw == null) return DEFAULT_TIMEOUT_MS;
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(n, 15 * 60 * 1000);
}

function parsePollIntervalMs(req: any) {
  const raw = req.query?.pollIntervalMs ?? req.query?.poll ?? undefined;
  if (raw == null) return DEFAULT_POLL_INTERVAL_MS;
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(n) || n < 1000) return DEFAULT_POLL_INTERVAL_MS;
  return Math.min(n, 30000);
}

function bytesToMb(bytes: number) {
  return Math.round((bytes / 1024 / 1024) * 100) / 100;
}

async function kieUploadFromUrl(params: { fileUrl: string; uploadPath: string; fileName?: string }) {
  const key = getKieApiKey();

  const resp = await fetch(KIE_FILE_UPLOAD_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      fileUrl: params.fileUrl,
      uploadPath: params.uploadPath,
      ...(params.fileName ? { fileName: params.fileName } : {}),
    }),
  });

  const data = (await resp.json().catch(() => null)) as KieUploadResult | null;
  if (!resp.ok) {
    return {
      ok: false as const,
      status: resp.status,
      upstream: data,
    };
  }

  return {
    ok: true as const,
    result: data,
  };
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
      ? {
          customMode: parsed.data.customMode,
          instrumental: parsed.data.instrumental,
          title: parsed.data.title,
          style: parsed.data.style,
          prompt: parsed.data.prompt,
          model: parsed.data.model,
          negativeTags: parsed.data.negativeTags,
        }
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

    // 1) Start Paxsenix job
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
        const records: PaxRecord[] = Array.isArray(statusJson?.records) ? statusJson.records : [];

        // 3) Upload each generated audio_url to KIE
        const uploads = await Promise.all(
          records.map(async (r, idx) => {
            const audioUrl = typeof r?.audio_url === "string" ? r.audio_url : "";
            if (!audioUrl) return { ok: false as const, message: "missing audio_url", recordIndex: idx };

            const kieFileName = (parsed.data.kieFileName || "").trim() || `${jobId}-${idx + 1}.mp3`;
            const up = await kieUploadFromUrl({
              fileUrl: audioUrl,
              uploadPath: parsed.data.kieUploadPath,
              fileName: kieFileName,
            });

            if (!up.ok) {
              return { ok: false as const, recordIndex: idx, uploadError: up };
            }

            const bytes = Number(up.result?.data?.fileSize ?? 0);

            return {
              ok: true as const,
              recordIndex: idx,
              sourceAudioUrl: audioUrl,
              kie: {
                downloadUrl: up.result?.data?.downloadUrl,
                fileSizeBytes: bytes,
                fileSizeMB: bytes ? bytesToMb(bytes) : 0,
                mimeType: up.result?.data?.mimeType,
                fileName: up.result?.data?.fileName,
                filePath: up.result?.data?.filePath,
                uploadedAt: up.result?.data?.uploadedAt,
              },
            };
          })
        );

        return json(
          res,
          200,
          normalizeAuthor({
            ...statusJson,
            jobId,
            task_url: taskUrl,
            kieUploads: uploads,
          })
        );
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

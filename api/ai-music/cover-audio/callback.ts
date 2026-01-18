import { z } from "zod";
import { getKieApiKey, json, normalizeAuthor, readJsonBody, KIE_FILE_UPLOAD_URL } from "../_utils";

type KieUploadResult = {
  success: boolean;
  code?: number;
  msg?: string;
  data?: {
    fileName?: string;
    filePath?: string;
    downloadUrl?: string;
    fileSize?: number;
    mimeType?: string;
    uploadedAt?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

const callbackSchema = z.object({
  code: z.number().optional(),
  msg: z.string().optional(),
  data: z
    .object({
      callbackType: z.string().optional(),
      task_id: z.string().optional(),
      data: z
        .array(
          z.object({
            id: z.string().optional(),
            audio_url: z.string().url().optional(),
            image_url: z.string().url().optional(),
            title: z.string().optional(),
            prompt: z.string().optional(),
            duration: z.number().optional(),
          })
        )
        .optional(),
    })
    .optional(),
});

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
  return { ok: resp.ok, status: resp.status, upstream: data };
}

export default async function handler(req: any, res: any) {
  // KIE callback akan hit endpoint ini
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, normalizeAuthor({ ok: false, message: "Method not allowed" }));

  try {
    const body = await readJsonBody(req);
    const parsed = callbackSchema.safeParse(body);
    if (!parsed.success) {
      return json(
        res,
        400,
        normalizeAuthor({ ok: false, message: "Invalid callback payload", errors: parsed.error.flatten() })
      );
    }

    const payload = parsed.data;
    const callbackType = payload.data?.callbackType;
    const items = payload.data?.data ?? [];

    // Sesuai permintaan: upload dulu audio_url (saat complete) agar nanti gampang diteruskan ke server utama.
    // Untuk menjaga response <= 15 detik, kita upload hanya track pertama (jika ada).
    let uploaded: any = null;
    if (payload.code === 200 && callbackType === "complete" && items.length > 0) {
      const first = items[0];
      const audioUrl = first?.audio_url;
      if (audioUrl) {
        const up = await kieUploadFromUrl({
          fileUrl: audioUrl,
          uploadPath: "music/cover-audio",
          fileName: `${payload.data?.task_id ?? "task"}-${first.id ?? "track"}.mp3`,
        });

        if (up.ok) {
          const bytes = Number(up.upstream?.data?.fileSize ?? 0);
          uploaded = {
            sourceAudioUrl: audioUrl,
            downloadUrl: up.upstream?.data?.downloadUrl,
            fileSizeBytes: bytes,
            fileSizeMB: bytes ? bytesToMb(bytes) : 0,
            mimeType: up.upstream?.data?.mimeType,
            fileName: up.upstream?.data?.fileName,
            filePath: up.upstream?.data?.filePath,
            uploadedAt: up.upstream?.data?.uploadedAt,
          };
        } else {
          uploaded = { ok: false, uploadError: up };
        }
      }
    }

    // Penting: callback harus 200 OK cepat.
    return json(
      res,
      200,
      normalizeAuthor({
        ok: true,
        received: payload,
        kieUploadedFirstTrack: uploaded,
      })
    );
  } catch (e: any) {
    return json(res, 500, normalizeAuthor({ ok: false, message: e?.message ?? "Internal error" }));
  }
}

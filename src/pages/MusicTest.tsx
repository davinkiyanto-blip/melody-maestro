import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const paxModels = ["V3_5", "V4", "V4_5", "V4_5PLUS", "V5"] as const;
type PaxModel = (typeof paxModels)[number];

const coverModels = ["V4", "V4_5", "V4_5PLUS", "V4_5ALL", "V5"] as const;
type CoverModel = (typeof coverModels)[number];

type ApiResult = {
  ok?: boolean;
  status?: string;
  jobId?: string;
  task_url?: string;
  [k: string]: unknown;
};

const paxFormSchema = z
  .object({
    customMode: z.boolean(),
    instrumental: z.boolean(),
    title: z.string(),
    style: z.string(),
    prompt: z.string(),
    model: z.enum(paxModels),
    negativeTags: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.customMode === false) {
      if (!v.prompt.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "prompt wajib saat customMode=false" });
      }
      if (v.prompt.length > 400) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "prompt max 400 karakter saat customMode=false" });
      }
      return;
    }

    if (!v.title.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "title wajib saat customMode=true" });
    if (!v.style.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "style wajib saat customMode=true" });

    if (v.instrumental === false && !v.prompt.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "prompt wajib saat customMode=true dan instrumental=false",
      });
    }

    if (v.title.length > 80) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "title max 80 karakter" });

    const isV35orV4 = v.model === "V3_5" || v.model === "V4";
    const promptLimit = isV35orV4 ? 3000 : 5000;
    const styleLimit = isV35orV4 ? 200 : 1000;

    if (v.prompt.length > promptLimit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `prompt max ${promptLimit} karakter untuk model ${v.model}`,
      });
    }
    if (v.style.length > styleLimit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `style max ${styleLimit} karakter untuk model ${v.model}`,
      });
    }
  });

const coverStartSchema = z.object({
  uploadUrl: z.string().url(),
  customMode: z.boolean(),
  instrumental: z.boolean(),
  model: z.enum(coverModels),
  style: z.string(),
  title: z.string(),
  prompt: z.string(),
  negativeTags: z.string(),
});

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function extractPaxRecords(result: any): { audio_url?: string; image_url?: string; title?: string; duration?: number }[] {
  const records = Array.isArray(result?.records) ? result.records : [];
  return records
    .map((r: any) => ({
      audio_url: typeof r?.audio_url === "string" ? r.audio_url : undefined,
      image_url: typeof r?.image_url === "string" ? r.image_url : undefined,
      title: typeof r?.title === "string" ? r.title : undefined,
      duration: typeof r?.duration === "number" ? r.duration : undefined,
    }))
    .filter((r: any) => r.audio_url);
}

function extractKieUploads(result: any): { sourceAudioUrl?: string; downloadUrl?: string; fileName?: string; fileSizeMB?: number }[] {
  const uploads = Array.isArray(result?.kieUploads) ? result.kieUploads : [];
  return uploads
    .map((u: any) => ({
      sourceAudioUrl: typeof u?.sourceAudioUrl === "string" ? u.sourceAudioUrl : undefined,
      downloadUrl: typeof u?.kie?.downloadUrl === "string" ? u.kie.downloadUrl : undefined,
      fileName: typeof u?.kie?.fileName === "string" ? u.kie.fileName : undefined,
      fileSizeMB: typeof u?.kie?.fileSizeMB === "number" ? u.kie.fileSizeMB : undefined,
    }))
    .filter((u: any) => u.sourceAudioUrl || u.downloadUrl);
}

function AudioList({ title, items }: { title: string; items: { label: string; url?: string }[] }) {
  if (!items.length) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">{title}</h2>
        <div className="text-xs text-muted-foreground">{items.length} track</div>
      </div>
      <div className="space-y-3">
        {items.map((it, idx) => (
          <div key={`${it.label}-${idx}`} className="rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{it.label}</div>
                <div className="truncate text-xs text-muted-foreground">{it.url || "-"}</div>
              </div>
              {it.url ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(it.url!)}
                >
                  Copy URL
                </Button>
              ) : null}
            </div>
            {it.url ? <audio controls preload="none" className="w-full" src={it.url} /> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

const MusicTest = () => {
  const { toast } = useToast();

  // Paxsenix form
  const [customMode, setCustomMode] = useState(true);
  const [instrumental, setInstrumental] = useState(false);
  const [model, setModel] = useState<PaxModel>("V5");
  const [title, setTitle] = useState("Why");
  const [style, setStyle] = useState("sad, electronic rock");
  const [prompt, setPrompt] = useState("I don't know man, write your own lyrics here, lol");
  const [negativeTags, setNegativeTags] = useState("");

  // Shared jobId status checker
  const [jobId, setJobId] = useState("");

  // Backend base URL (untuk preview Lovable yang tidak menjalankan /api)
  const [apiBaseUrl, setApiBaseUrl] = useState(() => {
    try {
      return localStorage.getItem("musicTest.apiBaseUrl") ?? "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("musicTest.apiBaseUrl", apiBaseUrl);
    } catch {
      // ignore
    }
  }, [apiBaseUrl]);

  const buildApiUrl = (path: string) => {
    const base = apiBaseUrl.trim().replace(/\/+$/, "");
    return base ? `${base}${path}` : path;
  };

  // KIE upload options (for wait-upload)
  const [kieUploadPath, setKieUploadPath] = useState("music/paxsenix");
  const [kieFileName, setKieFileName] = useState("");

  // Cover form
  const [coverUploadUrl, setCoverUploadUrl] = useState("");
  const [coverCustomMode, setCoverCustomMode] = useState(true);
  const [coverInstrumental, setCoverInstrumental] = useState(true);
  const [coverModel, setCoverModel] = useState<CoverModel>("V5");
  const [coverTitle, setCoverTitle] = useState("Cover Title");
  const [coverStyle, setCoverStyle] = useState("pop, upbeat");
  const [coverPrompt, setCoverPrompt] = useState("");
  const [coverNegativeTags, setCoverNegativeTags] = useState("");

  // Manual callback tester (so user can see uploaded audio result on UI)
  const [callbackJsonText, setCallbackJsonText] = useState(
    prettyJson({
      code: 200,
      msg: "",
      data: {
        callbackType: "complete",
        task_id: "task_xxx",
        data: [{ id: "track1", audio_url: "https://example.com/audio.mp3", image_url: "" }],
      },
    })
  );

  const [loading, setLoading] = useState<
    | "pax-generate"
    | "pax-wait"
    | "pax-wait-upload"
    | "status"
    | "cover-start"
    | "cover-callback"
    | null
  >(null);

  const [paxGenerateResult, setPaxGenerateResult] = useState<ApiResult | null>(null);
  const [paxWaitResult, setPaxWaitResult] = useState<ApiResult | null>(null);
  const [paxWaitUploadResult, setPaxWaitUploadResult] = useState<ApiResult | null>(null);
  const [statusResult, setStatusResult] = useState<ApiResult | null>(null);
  const [coverStartResult, setCoverStartResult] = useState<ApiResult | null>(null);
  const [coverCallbackResult, setCoverCallbackResult] = useState<ApiResult | null>(null);

  useEffect(() => {
    document.title = "Music API Test";
  }, []);

  const paxPayload = useMemo(
    () => ({
      customMode,
      instrumental,
      title,
      style,
      prompt,
      model,
      negativeTags,
    }),
    [customMode, instrumental, title, style, prompt, model, negativeTags]
  );

  const validatePaxPayload = () => {
    const parsed = paxFormSchema.safeParse(paxPayload);
    if (!parsed.success) {
      toast({
        title: "Input tidak valid",
        description: parsed.error.errors[0]?.message ?? "Periksa input Anda.",
        variant: "destructive",
      });
      return null;
    }
    return parsed.data;
  };

  const handlePaxGenerate = async () => {
    const valid = validatePaxPayload();
    if (!valid) return;

    setLoading("pax-generate");
    try {
      const resp = await fetch(buildApiUrl("/api/ai-music/suno-music"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valid),
      });
      const data = (await resp.json().catch(() => ({}))) as ApiResult;
      setPaxGenerateResult(data);

      if (!resp.ok) {
        toast({ title: "Generate gagal", description: `HTTP ${resp.status}`, variant: "destructive" });
        return;
      }

      if (data?.jobId) setJobId(String(data.jobId));
      toast({ title: "Generate OK", description: "Job dibuat. Bisa wait/status." });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Terjadi kesalahan", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const handlePaxWait = async () => {
    const valid = validatePaxPayload();
    if (!valid) return;

    setLoading("pax-wait");
    try {
      const resp = await fetch(
        buildApiUrl("/api/ai-music/suno-music/wait") + "?timeoutMs=300000&pollIntervalMs=5000",
        {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valid),
      });

      const data = (await resp.json().catch(() => ({}))) as ApiResult;
      setPaxWaitResult(data);

      if (!resp.ok) {
        toast({ title: "Wait selesai (error/timeout)", description: `HTTP ${resp.status}`, variant: "destructive" });
        return;
      }

      toast({ title: "Selesai", description: "Music generation done." });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Terjadi kesalahan", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const handlePaxWaitUpload = async () => {
    const valid = validatePaxPayload();
    if (!valid) return;

    setLoading("pax-wait-upload");
    try {
      const resp = await fetch(
        buildApiUrl("/api/ai-music/suno-music/wait-upload") + "?timeoutMs=300000&pollIntervalMs=5000",
        {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...valid,
          kieUploadPath,
          kieFileName,
        }),
      });

      const data = (await resp.json().catch(() => ({}))) as ApiResult;
      setPaxWaitUploadResult(data);

      if (!resp.ok) {
        toast({ title: "Wait+Upload gagal", description: `HTTP ${resp.status}`, variant: "destructive" });
        return;
      }

      toast({ title: "Upload OK", description: "Track sudah di-upload ke hosting (KIE)." });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Terjadi kesalahan", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const handleStatus = async () => {
    const id = jobId.trim();
    if (!id) {
      toast({ title: "jobId kosong", description: "Isi jobId dulu", variant: "destructive" });
      return;
    }

    setLoading("status");
    try {
      const resp = await fetch(buildApiUrl(`/api/task/${encodeURIComponent(id)}`));
      const data = (await resp.json().catch(() => ({}))) as ApiResult;
      setStatusResult(data);

      if (!resp.ok) {
        toast({ title: "Cek status gagal", description: `HTTP ${resp.status}`, variant: "destructive" });
        return;
      }

      toast({ title: "Status OK", description: `status: ${data?.status ?? "-"}` });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Terjadi kesalahan", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const handleCoverStart = async () => {
    const payload = {
      uploadUrl: coverUploadUrl,
      customMode: coverCustomMode,
      instrumental: coverInstrumental,
      model: coverModel,
      style: coverStyle,
      title: coverTitle,
      prompt: coverPrompt,
      negativeTags: coverNegativeTags,
    };

    const parsed = coverStartSchema.safeParse(payload);
    if (!parsed.success) {
      toast({
        title: "Input cover tidak valid",
        description: parsed.error.errors[0]?.message ?? "Periksa input Anda.",
        variant: "destructive",
      });
      return;
    }

    // Minimal rule (mirrors backend): customMode=true => style & title wajib
    if (parsed.data.customMode && (!parsed.data.style.trim() || !parsed.data.title.trim())) {
      toast({ title: "style/title wajib", description: "Saat customMode=true, isi style dan title.", variant: "destructive" });
      return;
    }

    setLoading("cover-start");
    try {
      const resp = await fetch(buildApiUrl("/api/ai-music/cover-audio"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      const data = (await resp.json().catch(() => ({}))) as ApiResult;
      setCoverStartResult(data);

      if (!resp.ok) {
        toast({ title: "Cover start gagal", description: `HTTP ${resp.status}`, variant: "destructive" });
        return;
      }

      toast({ title: "Cover started", description: "Menunggu callback dari provider." });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Terjadi kesalahan", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const handleCoverCallbackTest = async () => {
    let parsedBody: any = null;
    try {
      parsedBody = JSON.parse(callbackJsonText);
    } catch {
      toast({ title: "JSON tidak valid", description: "Periksa callback JSON.", variant: "destructive" });
      return;
    }

    setLoading("cover-callback");
    try {
      const resp = await fetch(buildApiUrl("/api/ai-music/cover-audio/callback"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedBody),
      });

      const data = (await resp.json().catch(() => ({}))) as ApiResult;
      setCoverCallbackResult(data);

      if (!resp.ok) {
        toast({ title: "Callback test gagal", description: `HTTP ${resp.status}`, variant: "destructive" });
        return;
      }

      toast({ title: "Callback processed", description: "Jika complete, audio pertama di-upload ke hosting." });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Terjadi kesalahan", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const handleCopy = async (value: unknown) => {
    await navigator.clipboard.writeText(prettyJson(value ?? {}));
    toast({ title: "Copied", description: "JSON sudah disalin." });
  };

  const paxWaitAudio = extractPaxRecords(paxWaitResult);
  const paxWaitUploadSourceAudio = extractPaxRecords(paxWaitUploadResult);
  const paxWaitUploadHostedAudio = extractKieUploads(paxWaitUploadResult).map((u, idx) => ({
    label: u.fileName || `uploaded-${idx + 1}`,
    url: u.downloadUrl,
  }));

  const coverUploadedUrl = (coverCallbackResult as any)?.kieUploadedFirstTrack?.downloadUrl as string | undefined;

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold md:text-2xl">Music API Test</h1>
            <p className="mt-1 text-xs text-muted-foreground md:text-sm">
              Mobile-friendly tester: Paxsenix generate/wait/wait+upload, serta cover audio.
            </p>
          </div>
          <NavLink
            to="/"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            activeClassName="text-foreground"
          >
            Home
          </NavLink>
        </div>
      </header>

      <section className="mx-auto w-full max-w-5xl px-4 py-6">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Backend Base URL</CardTitle>
            <CardDescription>
              Jika Anda tes di preview Lovable dan dapat <span className="font-mono">404</span>, isi base URL backend Vercel Anda (contoh:
              <span className="font-mono"> https://&lt;project&gt;.vercel.app</span>). Kosongkan untuk pakai same-origin.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="apiBaseUrl">API Base URL</Label>
            <Input
              id="apiBaseUrl"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              placeholder="https://<project>.vercel.app"
            />
            {(() => {
              const host = typeof window !== "undefined" ? window.location.host : "";
              const isLovablePreview = host.includes("lovable.app") || host.includes("lovableproject.com");
              if (!apiBaseUrl.trim() && isLovablePreview) {
                return (
                  <p className="text-xs text-muted-foreground">
                    Anda sedang di preview Lovable (frontend only). Endpoint <span className="font-mono">/api/*</span> tidak tersedia di sini,
                    jadi akan <span className="font-mono">404</span> sampai Anda mengisi API Base URL.
                  </p>
                );
              }
              return null;
            })()}
          </CardContent>
        </Card>

        <Tabs defaultValue="pax" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pax">Paxsenix</TabsTrigger>
            <TabsTrigger value="upload">Upload Hosting</TabsTrigger>
            <TabsTrigger value="cover">Cover</TabsTrigger>
          </TabsList>

          <TabsContent value="pax" className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>1) Generate Musik (Paxsenix)</CardTitle>
                <CardDescription>
                  Endpoint terpisah untuk server utama: <span className="font-mono">POST /api/ai-music/suno-music</span> dan
                  <span className="font-mono"> POST /api/ai-music/suno-music/wait</span>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="customMode">Custom Mode</Label>
                    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                      <span className="text-sm text-muted-foreground">{customMode ? "true" : "false"}</span>
                      <Switch id="customMode" checked={customMode} onCheckedChange={setCustomMode} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">simple mode</span> = customMode=false (wajib prompt max 400)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="instrumental">Instrumental</Label>
                    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                      <span className="text-sm text-muted-foreground">{instrumental ? "true" : "false"}</span>
                      <Switch id="instrumental" checked={instrumental} onCheckedChange={setInstrumental} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      customMode=true + instrumental=false → prompt/lyrics wajib.
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Select value={model} onValueChange={(v) => setModel(v as PaxModel)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih model" />
                      </SelectTrigger>
                      <SelectContent>
                        {paxModels.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="title">Title</Label>
                    <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Max 80" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="style">Style</Label>
                  <Input id="style" value={style} onChange={(e) => setStyle(e.target.value)} placeholder="e.g. sad, electronic rock" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prompt">Prompt / Lyrics</Label>
                  <Textarea id="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="negativeTags">Negative Tags</Label>
                  <Input id="negativeTags" value={negativeTags} onChange={(e) => setNegativeTags(e.target.value)} placeholder="opsional" />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={handlePaxGenerate} disabled={loading !== null}>
                    {loading === "pax-generate" ? "Generating..." : "Generate"}
                  </Button>
                  <Button variant="secondary" onClick={handlePaxWait} disabled={loading !== null}>
                    {loading === "pax-wait" ? "Waiting..." : "Wait (done/timeout)"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>2) Status Job</CardTitle>
                <CardDescription>
                  Endpoint terpisah untuk server utama: <span className="font-mono">GET /api/task/:jobId</span>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="jobId">jobId</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="jobId"
                      value={jobId}
                      onChange={(e) => setJobId(e.target.value)}
                      placeholder="1768393259037-n49bnbx3o"
                    />
                    <Button variant="outline" onClick={handleStatus} disabled={loading !== null}>
                      {loading === "status" ? "Checking..." : "Check"}
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">{statusResult?.status ? `status: ${String(statusResult.status)}` : "-"}</div>
                  <Button variant="outline" size="sm" onClick={() => handleCopy(statusResult)} disabled={!statusResult}>
                    Copy JSON
                  </Button>
                </div>

                <pre className="max-h-[360px] overflow-auto rounded-md border bg-muted p-3 text-xs">
                  {prettyJson(statusResult ?? { hint: "Klik Check untuk melihat response" })}
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Hasil Audio (Paxsenix)</CardTitle>
                <CardDescription>
                  Audio muncul setelah <span className="font-mono">wait</span> status done.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <AudioList
                  title="Audio dari /wait"
                  items={paxWaitAudio.map((r, i) => ({ label: r.title || `track-${i + 1}`, url: r.audio_url }))}
                />

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">/suno-music response</div>
                  <Button variant="outline" size="sm" onClick={() => handleCopy(paxGenerateResult)} disabled={!paxGenerateResult}>
                    Copy JSON
                  </Button>
                </div>
                <pre className="max-h-[260px] overflow-auto rounded-md border bg-muted p-3 text-xs">
                  {prettyJson(paxGenerateResult ?? { hint: "Klik Generate untuk membuat job" })}
                </pre>

                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">/wait response</div>
                  <Button variant="outline" size="sm" onClick={() => handleCopy(paxWaitResult)} disabled={!paxWaitResult}>
                    Copy JSON
                  </Button>
                </div>
                <pre className="max-h-[260px] overflow-auto rounded-md border bg-muted p-3 text-xs">
                  {prettyJson(paxWaitResult ?? { hint: "Klik Wait untuk mendapatkan records audio_url" })}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="upload" className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Upload ke Hosting (KIE) setelah Done</CardTitle>
                <CardDescription>
                  Endpoint terpisah untuk server utama: <span className="font-mono">POST /api/ai-music/suno-music/wait-upload</span>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="kieUploadPath">kieUploadPath</Label>
                    <Input
                      id="kieUploadPath"
                      value={kieUploadPath}
                      onChange={(e) => setKieUploadPath(e.target.value)}
                      placeholder="music/paxsenix"
                    />
                    <p className="text-xs text-muted-foreground">Path folder di hosting KIE.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="kieFileName">kieFileName (optional)</Label>
                    <Input
                      id="kieFileName"
                      value={kieFileName}
                      onChange={(e) => setKieFileName(e.target.value)}
                      placeholder="(auto) jobId-1.mp3"
                    />
                    <p className="text-xs text-muted-foreground">Jika kosong, auto: jobId-index.mp3.</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={handlePaxWaitUpload} disabled={loading !== null}>
                    {loading === "pax-wait-upload" ? "Working..." : "Wait + Upload"}
                  </Button>
                  <Button variant="outline" onClick={() => handleCopy(paxWaitUploadResult)} disabled={!paxWaitUploadResult}>
                    Copy JSON
                  </Button>
                </div>

                <Separator />

                <AudioList
                  title="Audio asli dari Paxsenix (records.audio_url)"
                  items={paxWaitUploadSourceAudio.map((r, i) => ({ label: r.title || `track-${i + 1}`, url: r.audio_url }))}
                />

                <AudioList
                  title="Audio hasil upload (kieUploads[].kie.downloadUrl)"
                  items={paxWaitUploadHostedAudio}
                />

                <Separator />

                <pre className="max-h-[360px] overflow-auto rounded-md border bg-muted p-3 text-xs">
                  {prettyJson(paxWaitUploadResult ?? { hint: "Klik Wait + Upload untuk mendapatkan downloadUrl hosting" })}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cover" className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Cover Audio (Start)</CardTitle>
                <CardDescription>
                  Endpoint terpisah untuk server utama: <span className="font-mono">POST /api/ai-music/cover-audio</span>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="coverUploadUrl">uploadUrl</Label>
                  <Input
                    id="coverUploadUrl"
                    value={coverUploadUrl}
                    onChange={(e) => setCoverUploadUrl(e.target.value)}
                    placeholder="https://.../source-audio.mp3"
                  />
                  <p className="text-xs text-muted-foreground">Link audio sumber untuk dibuat cover.</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="coverCustomMode">Custom Mode</Label>
                    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                      <span className="text-sm text-muted-foreground">{coverCustomMode ? "true" : "false"}</span>
                      <Switch id="coverCustomMode" checked={coverCustomMode} onCheckedChange={setCoverCustomMode} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="coverInstrumental">Instrumental</Label>
                    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                      <span className="text-sm text-muted-foreground">{coverInstrumental ? "true" : "false"}</span>
                      <Switch id="coverInstrumental" checked={coverInstrumental} onCheckedChange={setCoverInstrumental} />
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Select value={coverModel} onValueChange={(v) => setCoverModel(v as CoverModel)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih model" />
                      </SelectTrigger>
                      <SelectContent>
                        {coverModels.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="coverTitle">Title</Label>
                    <Input id="coverTitle" value={coverTitle} onChange={(e) => setCoverTitle(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="coverStyle">Style</Label>
                  <Input id="coverStyle" value={coverStyle} onChange={(e) => setCoverStyle(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="coverPrompt">Prompt (optional)</Label>
                  <Textarea id="coverPrompt" value={coverPrompt} onChange={(e) => setCoverPrompt(e.target.value)} rows={4} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="coverNegativeTags">Negative Tags</Label>
                  <Input id="coverNegativeTags" value={coverNegativeTags} onChange={(e) => setCoverNegativeTags(e.target.value)} placeholder="opsional" />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleCoverStart} disabled={loading !== null}>
                    {loading === "cover-start" ? "Starting..." : "Start Cover"}
                  </Button>
                  <Button variant="outline" onClick={() => handleCopy(coverStartResult)} disabled={!coverStartResult}>
                    Copy JSON
                  </Button>
                </div>

                <pre className="max-h-[320px] overflow-auto rounded-md border bg-muted p-3 text-xs">
                  {prettyJson(coverStartResult ?? { hint: "Klik Start Cover untuk memulai job (provider akan callback)" })}
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cover Audio (Callback → Upload)</CardTitle>
                <CardDescription>
                  Endpoint terpisah untuk server utama: <span className="font-mono">POST /api/ai-music/cover-audio/callback</span>.\n
                  Untuk tes UI, Anda bisa paste payload callback di bawah (simulasi) supaya terlihat hasil audio upload.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="callbackJson">Callback JSON</Label>
                  <Textarea
                    id="callbackJson"
                    value={callbackJsonText}
                    onChange={(e) => setCallbackJsonText(e.target.value)}
                    rows={10}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleCoverCallbackTest} disabled={loading !== null}>
                    {loading === "cover-callback" ? "Processing..." : "Process Callback (Test)"}
                  </Button>
                  <Button variant="outline" onClick={() => handleCopy(coverCallbackResult)} disabled={!coverCallbackResult}>
                    Copy JSON
                  </Button>
                </div>

                {coverUploadedUrl ? (
                  <div className="rounded-lg border p-3">
                    <div className="mb-2 text-sm font-medium">Audio hasil cover (sudah upload)</div>
                    <div className="mb-2 truncate text-xs text-muted-foreground">{coverUploadedUrl}</div>
                    <audio controls preload="none" className="w-full" src={coverUploadedUrl} />
                  </div>
                ) : null}

                <pre className="max-h-[320px] overflow-auto rounded-md border bg-muted p-3 text-xs">
                  {prettyJson(coverCallbackResult ?? { hint: "Callback asli akan dikirim provider. Di sini untuk simulasi." })}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </section>
    </main>
  );
};

export default MusicTest;

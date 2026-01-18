import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { NavLink } from "@/components/NavLink";

const models = ["V3_5", "V4", "V4_5", "V4_5PLUS", "V5"] as const;

type Model = (typeof models)[number];

type ApiResult = {
  ok?: boolean;
  status?: string;
  jobId?: string;
  task_url?: string;
  [k: string]: unknown;
};

const formSchema = z
  .object({
    customMode: z.boolean(),
    instrumental: z.boolean(),
    title: z.string(),
    style: z.string(),
    prompt: z.string(),
    model: z.enum(models),
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

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const MusicTest = () => {
  const { toast } = useToast();

  const [customMode, setCustomMode] = useState(true);
  const [instrumental, setInstrumental] = useState(false);
  const [model, setModel] = useState<Model>("V5");
  const [title, setTitle] = useState("Why");
  const [style, setStyle] = useState("sad, electronic rock");
  const [prompt, setPrompt] = useState("I don't know man, write your own lyrics here, lol");
  const [negativeTags, setNegativeTags] = useState("");

  const [jobId, setJobId] = useState("");
  const [loading, setLoading] = useState<"generate" | "wait" | "status" | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);

  useEffect(() => {
    document.title = "Music API Test";
  }, []);

  const payload = useMemo(
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

  const validate = () => {
    const parsed = formSchema.safeParse(payload);
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

  const handleGenerate = async () => {
    const valid = validate();
    if (!valid) return;

    setLoading("generate");
    try {
      const resp = await fetch("/api/ai-music/suno-music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valid),
      });

      const data = (await resp.json().catch(() => ({}))) as ApiResult;
      setResult(data);

      if (!resp.ok) {
        toast({ title: "Generate gagal", description: `HTTP ${resp.status}`, variant: "destructive" });
        return;
      }

      if (data?.jobId) setJobId(String(data.jobId));

      toast({ title: "Generate OK", description: "Job dibuat. Anda bisa cek status / wait." });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Terjadi kesalahan", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const handleWait = async () => {
    const valid = validate();
    if (!valid) return;

    setLoading("wait");
    try {
      const resp = await fetch("/api/ai-music/suno-music/wait?timeoutMs=300000&pollIntervalMs=5000", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valid),
      });

      const data = (await resp.json().catch(() => ({}))) as ApiResult;
      setResult(data);

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

  const handleStatus = async () => {
    const id = jobId.trim();
    if (!id) {
      toast({ title: "jobId kosong", description: "Isi jobId dulu", variant: "destructive" });
      return;
    }

    setLoading("status");
    try {
      const resp = await fetch(`/api/task/${encodeURIComponent(id)}`);
      const data = (await resp.json().catch(() => ({}))) as ApiResult;
      setResult(data);

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

  const handleCopy = async () => {
    const text = prettyJson(result ?? {});
    await navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "JSON hasil sudah disalin." });
  };

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-2xl font-semibold">Music API Test</h1>
            <p className="text-sm text-muted-foreground">Test generate / wait / status tanpa expose API key.</p>
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
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Request</CardTitle>
              <CardDescription>Isi parameter lalu klik Generate / Wait.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="customMode">Custom Mode</Label>
                  <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                    <span className="text-sm text-muted-foreground">{customMode ? "true" : "false"}</span>
                    <Switch id="customMode" checked={customMode} onCheckedChange={setCustomMode} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="instrumental">Instrumental</Label>
                  <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                    <span className="text-sm text-muted-foreground">{instrumental ? "true" : "false"}</span>
                    <Switch id="instrumental" checked={instrumental} onCheckedChange={setInstrumental} />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Model</Label>
                  <Select value={model} onValueChange={(v) => setModel(v as Model)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih model" />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((m) => (
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
                <Button onClick={handleGenerate} disabled={loading !== null}>
                  {loading === "generate" ? "Generating..." : "Generate"}
                </Button>
                <Button variant="secondary" onClick={handleWait} disabled={loading !== null}>
                  {loading === "wait" ? "Waiting..." : "Wait (done/timeout)"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status & Result</CardTitle>
              <CardDescription>Gunakan jobId untuk cek status, atau lihat JSON hasil.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="jobId">jobId</Label>
                <div className="flex gap-2">
                  <Input id="jobId" value={jobId} onChange={(e) => setJobId(e.target.value)} placeholder="1768393259037-n49bnbx3o" />
                  <Button variant="outline" onClick={handleStatus} disabled={loading !== null}>
                    {loading === "status" ? "Checking..." : "Check"}
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  {result?.status ? `status: ${String(result.status)}` : "-"}
                </div>
                <Button variant="outline" size="sm" onClick={handleCopy} disabled={!result}>
                  Copy JSON
                </Button>
              </div>

              <pre className="max-h-[420px] overflow-auto rounded-md border bg-muted p-3 text-xs">
                {prettyJson(result ?? { hint: "Klik Generate / Wait / Check untuk melihat response" })}
              </pre>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
};

export default MusicTest;

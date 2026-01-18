# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

### Lovable (Frontend)
Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

### Vercel (Backend API)
Folder `api/` berisi Vercel Serverless Functions siap deploy.

1) Push repo ini ke GitHub
2) Import ke Vercel
3) Set Environment Variable berikut:
   - `PAXSENIX_API_KEY` (private)
   - `KIE_API_KEY` (private)

## Backend API (Vercel) — Endpoint Docs

Base URL contoh:
- Lokal: `http://localhost:3000`
- Production: `https://<project>.vercel.app`

Halaman tes (mobile-friendly):
- `GET /music-test`

Semua endpoint akan menambahkan:
- `Author: "@Dafidxcode"`

> Catatan:
> - Endpoint Paxsenix membutuhkan env `PAXSENIX_API_KEY`.
> - Endpoint KIE membutuhkan env `KIE_API_KEY`.

---

### 1) Generate Job (Paxsenix)
**POST** `/api/ai-music/suno-music`

#### Request body
```json
{
  "customMode": true,
  "instrumental": false,
  "title": "Why",
  "style": "sad, electronic rock",
  "prompt": "I don't know man, write your own lyrics here, lol",
  "model": "V5",
  "negativeTags": ""
}
```

#### cURL
```bash
curl -X POST "https://<project>.vercel.app/api/ai-music/suno-music" \
  -H "Content-Type: application/json" \
  -d '{
    "customMode": true,
    "instrumental": false,
    "title": "Why",
    "style": "sad, electronic rock",
    "prompt": "I don\u0027t know man, write your own lyrics here, lol",
    "model": "V5",
    "negativeTags": ""
  }'
```

#### Response sukses (contoh)
```json
{
  "Author": "@Dafidxcode",
  "ok": true,
  "message": "Here is your job id and task url!",
  "jobId": "1768393259037-n49bnbx3o",
  "task_url": "https://api.paxsenix.org/task/1768393259037-n49bnbx3o"
}
```

---

### 2) Wait Until Done (Paxsenix)
**POST** `/api/ai-music/suno-music/wait`

Endpoint ini akan:
- start job
- polling status tiap **5 detik**
- return saat `status: "done"` atau timeout

#### Query params (opsional)
- `timeoutMs` (default 300000, max 900000)
- `pollIntervalMs` (default 5000, min 1000, max 30000)

#### cURL
```bash
curl -X POST "https://<project>.vercel.app/api/ai-music/suno-music/wait?timeoutMs=300000" \
  -H "Content-Type: application/json" \
  -d '{
    "customMode": true,
    "instrumental": false,
    "title": "Why",
    "style": "sad, electronic rock",
    "prompt": "I don\u0027t know man, write your own lyrics here, lol",
    "model": "V5",
    "negativeTags": ""
  }'
```

#### Response sukses (done) — contoh
```json
{
  "Author": "@Dafidxcode",
  "ok": true,
  "status": "done",
  "records": [
    {
      "id": "847525301452800",
      "image_url": "https://cdn-0.paxsenix.org/file/....jpg",
      "audio_url": "https://cdn-0.paxsenix.org/file/....mp3",
      "duration": 129.88
    }
  ],
  "completedAt": "2026-01-10T04:43:49.085Z"
}
```

#### Response pending — contoh
```json
{
  "Author": "@Dafidxcode",
  "ok": false,
  "status": "pending",
  "createdAt": "2026-01-10T04:41:58.747Z",
  "parameters": {
    "prompt": "I don't know man, write your own lyrics here, lol",
    "title": "",
    "style": "",
    "model": "V5"
  }
}
```

#### Response processing — contoh
```json
{
  "Author": "@Dafidxcode",
  "ok": false,
  "status": "processing",
  "createdAt": "2026-01-10T04:41:58.747Z",
  "progress": "Music generation in progress"
}
```

#### Response timeout (HTTP 408) — contoh
```json
{
  "Author": "@Dafidxcode",
  "ok": false,
  "status": "processing",
  "message": "Timeout waiting for music generation to finish",
  "jobId": "1768393259037-n49bnbx3o",
  "task_url": "https://api.paxsenix.org/task/1768393259037-n49bnbx3o",
  "lastResponse": {
    "ok": false,
    "status": "processing",
    "progress": "Music generation in progress"
  }
}
```

---

### 3) Wait + Upload to KIE (Paxsenix ➜ KIE)
**POST** `/api/ai-music/suno-music/wait-upload`

Endpoint ini sama seperti `/wait`, tetapi setelah `done` akan:
- mengambil `records[].audio_url`
- upload ke KIE **File Upload via URL**
- mengembalikan response `kieUploads[]` berisi `downloadUrl`, `fileSizeMB`, dll.

#### Request body tambahan
- `kieUploadPath` (default `music/paxsenix`)
- `kieFileName` (opsional; kalau kosong auto: `<jobId>-<index>.mp3`)

#### cURL
```bash
curl -X POST "https://<project>.vercel.app/api/ai-music/suno-music/wait-upload" \
  -H "Content-Type: application/json" \
  -d '{
    "customMode": false,
    "prompt": "lofi chill beat",
    "kieUploadPath": "music/paxsenix"
  }'
```

#### Response sukses (done + kieUploads) — contoh
```json
{
  "Author": "@Dafidxcode",
  "ok": true,
  "status": "done",
  "jobId": "1768393259037-n49bnbx3o",
  "task_url": "https://api.paxsenix.org/task/1768393259037-n49bnbx3o",
  "records": [
    {
      "audio_url": "https://cdn-0.paxsenix.org/file/....mp3"
    }
  ],
  "kieUploads": [
    {
      "ok": true,
      "recordIndex": 0,
      "sourceAudioUrl": "https://cdn-0.paxsenix.org/file/....mp3",
      "kie": {
        "downloadUrl": "https://tempfile.redpandaai.co/xxx/music/paxsenix/....mp3",
        "fileSizeBytes": 154832,
        "fileSizeMB": 0.15,
        "mimeType": "audio/mpeg",
        "fileName": "1768393259037-n49bnbx3o-1.mp3",
        "filePath": "music/paxsenix/1768393259037-n49bnbx3o-1.mp3",
        "uploadedAt": "2025-01-01T12:00:00.000Z"
      }
    }
  ]
}
```

---

### 4) Check Status by Job ID (Paxsenix)
**GET** `/api/task/:jobId`

#### cURL
```bash
curl -X GET "https://<project>.vercel.app/api/task/1768393259037-n49bnbx3o"
```

---

## Halaman Tes (UI)
Buka: `GET /music-test`

UI ini dibuat untuk memastikan semua fitur bisa dites **terpisah** (sesuai kebutuhan server utama):
- Tab **Paxsenix**: `POST /api/ai-music/suno-music`, `POST /api/ai-music/suno-music/wait`, `GET /api/task/:jobId`
- Tab **Upload Hosting**: `POST /api/ai-music/suno-music/wait-upload` (menampilkan `records.audio_url` dan `kieUploads[].kie.downloadUrl` + audio player)
- Tab **Cover**: `POST /api/ai-music/cover-audio` dan tester `POST /api/ai-music/cover-audio/callback` (simulasi payload untuk melihat hasil upload)

---

## KIE — Cover Audio

### 5) Start Cover Audio (KIE)
**POST** `/api/ai-music/cover-audio`

Body minimal:
```json
{
  "uploadUrl": "https://.../source.mp3",
  "customMode": true,
  "style": "Classical",
  "title": "Peaceful Piano Meditation",
  "prompt": "A calm and relaxing piano track",
  "model": "V5"
}
```

- Jika `callBackUrl` tidak dikirim, otomatis memakai:
  - `https://<project>.vercel.app/api/ai-music/cover-audio/callback`

### 6) Callback Cover Audio (KIE → Server)
**POST** `/api/ai-music/cover-audio/callback`

- Endpoint ini menerima callback dari KIE (`callbackType`: `text`, `first`, `complete`, dll).
- Saat `callbackType="complete"`, endpoint akan **upload dulu track pertama** (`audio_url`) ke KIE file-url-upload dan mengembalikan field `kieUploadedFirstTrack`.

> KIE mensyaratkan callback dibalas `200 OK` dalam 15 detik.



## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)


'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link2, UploadCloud, Loader2, CheckCircle2, AlertCircle, Sparkles, X, Youtube, Film } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CAPTION_PRESETS } from '@/lib/render/edit-doc';
import { DURATION_PRESETS } from '@/pipeline/stages';

type Inspection = {
  videoId: string; url: string; title: string; channelTitle: string | null; durationSeconds: number | null; thumbnailUrl: string;
  owned: boolean; canAcquire: boolean; blocker?: string; message?: string;
};
type Upload = { uploadId: string; fileName: string; size: number; duration: number; width: number; height: number; hasAudio: boolean; videoCodec: string | null };
type YtStatus = { state: string; connected: boolean; channel: { title: string } | null; error?: string | null };

const fmt = (s: number | null | undefined) => {
  if (!s && s !== 0) return '–';
  const t = Math.round(s);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), r = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
};
const mb = (b: number) => (b > 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : `${(b / 1024 ** 2).toFixed(1)} MB`);

export function CreateShorts() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [inspecting, setInspecting] = useState(false);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [durations, setDurations] = useState<number[]>([30]);
  const [custom, setCustom] = useState('');
  const [maxShorts, setMaxShorts] = useState(5);
  const [aspect, setAspect] = useState<'9:16' | '16:9' | '1:1'>('9:16');
  const [captionPreset, setCaptionPreset] = useState('bold_pop');
  const [removeDeadAir, setRemoveDeadAir] = useState(true);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [yt, setYt] = useState<YtStatus | null>(null);

  useEffect(() => {
    fetch('/api/youtube/status').then((r) => r.json()).then((j) => setYt(j.report)).catch(() => setYt(null));
  }, []);

  // Inspect the URL shortly after the user stops typing / pastes.
  useEffect(() => {
    setInspection(null);
    setUrlError(null);
    const value = url.trim();
    if (!value) return;
    const t = setTimeout(async () => {
      setInspecting(true);
      try {
        const res = await fetch('/api/ingest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: value }) });
        const j = await res.json();
        if (!j.ok) setUrlError(j.error);
        else setInspection(j.video);
      } catch {
        setUrlError('Could not check this link. Check your connection and try again.');
      } finally {
        setInspecting(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [url]);

  const clearFile = useCallback(() => {
    xhrRef.current?.abort();
    if (localPreview) URL.revokeObjectURL(localPreview);
    setFile(null);
    setLocalPreview(null);
    setUpload(null);
    setUploadPct(null);
    setUploadError(null);
  }, [localPreview]);

  const startUpload = useCallback((f: File) => {
    setUploadError(null);
    setUpload(null);
    if (!/\.(mp4|mov|webm|mkv|m4v)$/i.test(f.name)) {
      setUploadError('Unsupported file type. Use MP4, MOV, WebM or MKV.');
      return;
    }
    setFile(f);
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(URL.createObjectURL(f));
    setUploadPct(0);
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open('POST', '/api/upload');
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('x-file-name', encodeURIComponent(f.name));
    xhr.upload.onprogress = (e) => e.lengthComputable && setUploadPct(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let j: any = {};
      try { j = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) {
        setUpload(j);
        setUploadPct(100);
      } else {
        setUploadError(j.error || `Upload failed (HTTP ${xhr.status}).`);
        setUploadPct(null);
      }
    };
    xhr.onerror = () => {
      setUploadError('The upload was interrupted. Check your connection and try again.');
      setUploadPct(null);
    };
    xhr.send(f);
    setUrl('');
  }, [localPreview]);

  const toggleDuration = (d: number) => setDurations((cur) => (cur.includes(d) ? (cur.length > 1 ? cur.filter((x) => x !== d) : cur) : [...cur, d].sort((a, b) => a - b)));

  const source = upload ? 'upload' : inspection?.canAcquire ? 'youtube' : null;
  const allDurations = [...durations, ...(custom && Number(custom) >= 5 && Number(custom) <= 180 ? [Number(custom)] : [])];

  async function start() {
    if (!source) return;
    setStarting(true);
    setStartError(null);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: source === 'upload' ? { type: 'upload', uploadId: upload!.uploadId, fileName: upload!.fileName } : { type: 'youtube', url: inspection!.url },
          options: { durations: allDurations, maxShorts, aspect, captionPreset, removeDeadAir },
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not start.');
      router.push(`/projects/${j.projectId}`);
    } catch (err: any) {
      setStartError(err.message);
      setStarting(false);
    }
  }

  const needsConnect = inspection && (inspection.blocker === 'NOT_CONNECTED' || inspection.blocker === 'REAUTH_REQUIRED');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Create shorts</h1>
        <p className="text-sm text-muted-foreground mt-1">Paste a YouTube link from your channel or upload a video. AI finds the best moments and cuts them into shorts you can edit.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* YouTube */}
        <section className={cn('rounded-xl border bg-card p-4 md:p-5 space-y-3', source === 'youtube' && 'border-primary/60 ring-1 ring-primary/30')}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold text-sm flex items-center gap-2"><Youtube className="w-4 h-4 text-primary" /> YouTube link</h2>
            {yt && (
              yt.connected ? (
                <span className="text-xs text-muted-foreground truncate">Channel: <span className="font-semibold text-foreground">{yt.channel?.title}</span></span>
              ) : (
                <a href="/api/youtube/connect?return=/" className="text-xs font-semibold text-primary hover:underline">
                  {yt.state === 'REAUTH_REQUIRED' ? 'Renew YouTube connection' : 'Connect YouTube'}
                </a>
              )
            )}
          </div>
          <div className="relative">
            <Link2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={url}
              onChange={(e) => { setUrl(e.target.value); if (e.target.value) clearFile(); }}
              placeholder="https://youtube.com/watch?v=…"
              className="w-full rounded-lg border bg-background pl-9 pr-9 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              inputMode="url"
              aria-label="YouTube link"
            />
            {inspecting && <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </div>
          {urlError && <p className="text-sm text-destructive flex gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{urlError}</p>}
          {inspection && (
            <div className="flex gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={inspection.thumbnailUrl} alt="" className="w-36 aspect-video rounded-md object-cover bg-muted shrink-0" />
              <div className="min-w-0 space-y-1">
                <p className="font-semibold text-sm leading-snug line-clamp-2">{inspection.title}</p>
                <p className="text-xs text-muted-foreground">{inspection.channelTitle || 'Unknown channel'} · {fmt(inspection.durationSeconds)}</p>
                {inspection.canAcquire ? (
                  <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> On your channel — ready to process</p>
                ) : (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {inspection.message}{' '}
                    {needsConnect && <a href="/api/youtube/connect?return=/" className="font-semibold underline">Connect</a>}
                  </p>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Upload */}
        <section
          className={cn('rounded-xl border bg-card p-4 md:p-5 space-y-3 transition-colors', dragOver && 'border-primary bg-primary/5', source === 'upload' && 'border-primary/60 ring-1 ring-primary/30')}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) startUpload(f); }}
        >
          <h2 className="font-bold text-sm flex items-center gap-2"><Film className="w-4 h-4 text-primary" /> Upload a video</h2>
          <input ref={fileInput} type="file" accept=".mp4,.mov,.webm,.mkv,.m4v,video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) startUpload(f); e.target.value = ''; }} />
          {!file ? (
            <button onClick={() => fileInput.current?.click()} className="w-full rounded-lg border-2 border-dashed py-8 flex flex-col items-center gap-2 text-sm text-muted-foreground hover:border-primary/60 hover:text-foreground transition-colors">
              <UploadCloud className="w-7 h-7" />
              <span><span className="font-semibold text-foreground">Choose a file</span> or drag it here</span>
              <span className="text-xs">MP4, MOV, WebM, MKV</span>
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {mb(file.size)}
                    {upload && ` · ${fmt(upload.duration)} · ${upload.width}×${upload.height} · ${upload.hasAudio ? 'with audio' : 'no audio'}`}
                  </p>
                </div>
                <button onClick={clearFile} className="p-1 rounded hover:bg-muted" aria-label="Remove file"><X className="w-4 h-4" /></button>
              </div>
              {uploadPct !== null && uploadPct < 100 && (
                <div className="space-y-1">
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${uploadPct}%` }} /></div>
                  <p className="text-xs text-muted-foreground">Uploading… {uploadPct}%</p>
                </div>
              )}
              {uploadPct === 100 && !upload && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Checking the video…</p>}
              {upload && <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Uploaded and verified</p>}
            </div>
          )}
          {uploadError && <p className="text-sm text-destructive flex gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{uploadError}</p>}
        </section>
      </div>

      {(localPreview || inspection) && (
        <section className="rounded-xl border bg-card p-3 md:p-4">
          {localPreview ? (
            <video src={localPreview} controls className="w-full max-h-[420px] rounded-lg bg-black" />
          ) : inspection ? (
            <div className="aspect-video max-h-[420px] w-full rounded-lg overflow-hidden bg-black">
              <iframe className="w-full h-full" src={`https://www.youtube-nocookie.com/embed/${inspection.videoId}`} title={inspection.title} allow="encrypted-media; picture-in-picture" allowFullScreen />
            </div>
          ) : null}
        </section>
      )}

      <section className="rounded-xl border bg-card p-4 md:p-5 space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Short length</label>
            <div className="flex flex-wrap gap-1.5">
              {DURATION_PRESETS.map((d) => (
                <button key={d} onClick={() => toggleDuration(d)} className={cn('px-3 py-1.5 rounded-md text-xs font-semibold border', durations.includes(d) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted')}>{d}s</button>
              ))}
              <input value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Custom" className="w-20 px-2 py-1.5 rounded-md text-xs border bg-background" aria-label="Custom duration in seconds" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Number of shorts: {maxShorts}</label>
            <input type="range" min={1} max={10} value={maxShorts} onChange={(e) => setMaxShorts(Number(e.target.value))} className="w-full accent-[var(--primary)]" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Format</label>
            <div className="flex gap-1.5">
              {(['9:16', '1:1', '16:9'] as const).map((a) => (
                <button key={a} onClick={() => setAspect(a)} className={cn('px-3 py-1.5 rounded-md text-xs font-semibold border', aspect === a ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted')}>{a}</button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Captions</label>
            <select value={captionPreset} onChange={(e) => setCaptionPreset(e.target.value)} className="w-full px-2 py-1.5 rounded-md text-sm border bg-background">
              {Object.keys(CAPTION_PRESETS).map((k) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={removeDeadAir} onChange={(e) => setRemoveDeadAir(e.target.checked)} className="accent-[var(--primary)]" />
          Remove long pauses inside clips
        </label>
        {startError && <p className="text-sm text-destructive flex gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{startError}</p>}
        <button
          onClick={start}
          disabled={!source || starting}
          className="w-full md:w-auto px-6 py-3 rounded-lg bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-95"
        >
          {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Start AI extraction
        </button>
      </section>
    </div>
  );
}

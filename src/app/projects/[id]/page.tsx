'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Circle, Loader2, XCircle, RefreshCw, StopCircle, Download, Scissors, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STAGES, DURATION_PRESETS } from '@/pipeline/stages';

type Snapshot = {
  project: { id: string; title: string; status: string; progress: number; currentStage: string; error: string | null; sourceType: string; sourceUrl: string | null };
  stages: Array<{ n: number; key: string; name: string; status: string; percent: number; message: string; error: string | null }>;
  job: { id: string; status: string; progress: number; stage: string; message: string; error: string | null; attempts: number; maxAttempts: number } | null;
  shortJobs: Array<{ id: string; shortId: string; type: string; status: string; progress: number; message: string; error: string | null }>;
  asset: { probe: any; previewUrl: string | null; thumbnailUrl: string | null; ai: { audio: any; video: any } } | null;
  shorts: Array<{
    id: string; rank: number; title: string; description: string | null; reason: string | null; category: string | null; score: number | null;
    startTime: number; endTime: number; duration: number; status: string; version: number; videoUrl: string | null; downloadUrl: string | null;
    thumbnailUrl: string | null; qc: any; transcript: string | null;
  }>;
};

const fmt = (s: number) => {
  const t = Math.max(0, Math.round(s));
  const m = Math.floor(t / 60), r = t % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
};

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/projects/${id}/events`);
    es.onopen = () => setLive(true);
    es.onmessage = (e) => setSnap(JSON.parse(e.data));
    es.addEventListener('gone', () => { setNotFound(true); es.close(); });
    es.onerror = () => setLive(false); // EventSource reconnects automatically
    return () => es.close();
  }, [id]);

  async function post(url: string, body?: any, key?: string) {
    setBusy(key || url);
    setActionError(null);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Request failed');
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setBusy(null);
    }
  }

  if (notFound) return <p className="text-sm">Project not found. <Link href="/projects" className="text-primary underline">All projects</Link></p>;
  if (!snap) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading project…</div>;

  const { project, stages, job, shorts, shortJobs, asset } = snap;
  const running = job && (job.status === 'queued' || job.status === 'running');
  const failed = project.status === 'error' || job?.status === 'failed';
  const stageByKey = new Map(stages.map((s) => [s.key, s]));
  const aiWarnings = [asset?.ai?.audio?.error, asset?.ai?.video?.error].filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <Link href="/projects" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Projects</Link>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight truncate">{project.title}</h1>
          <p className="text-xs text-muted-foreground">
            {project.sourceType === 'youtube' ? 'From YouTube' : 'Uploaded video'}
            {asset?.probe && ` · ${fmt(asset.probe.duration)} · ${asset.probe.width}×${asset.probe.height}`}
            {' · '}<span className={live ? 'text-emerald-600 dark:text-emerald-400' : ''}>{live ? 'live' : 'reconnecting…'}</span>
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {running && (
            <button onClick={() => post(`/api/projects/${id}/cancel`, undefined, 'cancel')} disabled={busy === 'cancel'} className="px-3 py-2 rounded-lg border text-sm font-semibold flex items-center gap-1.5 hover:bg-muted">
              <StopCircle className="w-4 h-4" /> Cancel
            </button>
          )}
          {!running && (failed || project.status === 'cancelled') && (
            <button onClick={() => post(`/api/projects/${id}/retry`, undefined, 'retry')} disabled={busy === 'retry'} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold flex items-center gap-1.5">
              {busy === 'retry' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Retry
            </button>
          )}
        </div>
      </div>

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {(running || failed || project.status === 'cancelled' || !shorts.length) && (
        <section className="rounded-xl border bg-card p-4 md:p-5 space-y-4">
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="font-semibold">{failed ? 'Processing failed' : project.status === 'cancelled' ? 'Cancelled' : running ? job?.message || 'Working…' : project.currentStage}</span>
              <span className="tabular-nums text-muted-foreground">{project.progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className={cn('h-full transition-all duration-500', failed ? 'bg-destructive' : 'bg-primary')} style={{ width: `${Math.max(2, project.progress)}%` }} />
            </div>
            {job && job.attempts > 1 && running && <p className="text-xs text-muted-foreground">Attempt {job.attempts} of {job.maxAttempts}</p>}
          </div>
          {failed && (project.error || job?.error) && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm flex gap-2">
              <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <span>{job?.error || project.error}</span>
            </div>
          )}
          <ol className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {STAGES.map((s) => {
              const st = stageByKey.get(s.key);
              const status = st?.status || 'PENDING';
              return (
                <li key={s.key} className="flex items-start gap-2 text-sm">
                  {status === 'COMPLETED' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    : status === 'ACTIVE' ? <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0 mt-0.5" />
                    : status === 'FAILED' ? <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                    : <Circle className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />}
                  <span className="min-w-0">
                    <span className={cn('font-medium', status === 'PENDING' && 'text-muted-foreground')}>{s.n}. {s.name}</span>
                    {st?.message && status !== 'PENDING' && <span className="block text-xs text-muted-foreground truncate" title={st.message}>{st.message}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {aiWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-400/50 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm flex gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>Parts of the AI analysis did not run, so these shorts were chosen from measured audio and scene signals only: {aiWarnings.join(' ')}</span>
        </div>
      )}

      {shorts.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-bold">Generated shorts ({shorts.filter((s) => s.status === 'ready').length} ready)</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shorts.map((s) => {
              const sj = shortJobs.find((j) => j.shortId === s.id && (j.status === 'queued' || j.status === 'running'));
              const failedJob = shortJobs.find((j) => j.shortId === s.id && j.status === 'failed');
              const qcFails = (s.qc?.checks || []).filter((c: any) => !c.ok && c.severity === 'error');
              return (
                <article key={s.id} className="rounded-xl border bg-card overflow-hidden flex flex-col">
                  <div className="bg-black aspect-[9/16] max-h-[460px] w-full flex items-center justify-center relative">
                    {s.videoUrl && s.status !== 'rendering' ? (
                      <video key={s.videoUrl} src={s.videoUrl} poster={s.thumbnailUrl || undefined} controls preload="metadata" className="w-full h-full object-contain" />
                    ) : (
                      <div className="text-white/80 text-sm flex flex-col items-center gap-2 p-4 text-center">
                        {s.status === 'failed' ? <XCircle className="w-6 h-6 text-red-400" /> : <Loader2 className="w-6 h-6 animate-spin" />}
                        {sj ? `${sj.message || 'Queued'}` : s.status === 'failed' ? 'Render failed' : 'Waiting to render'}
                      </div>
                    )}
                  </div>
                  <div className="p-3 space-y-2 flex-1 flex flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-sm leading-snug">{s.title}</h3>
                      {s.score !== null && <span className="text-xs font-bold tabular-nums rounded bg-muted px-1.5 py-0.5 shrink-0">{s.score}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">{fmt(s.startTime)}–{fmt(s.endTime)} of source · {s.duration.toFixed(1)}s{s.category ? ` · ${s.category}` : ''}</p>
                    {s.description && <p className="text-xs">{s.description}</p>}
                    {s.reason && <p className="text-xs text-muted-foreground italic">{s.reason}</p>}
                    {qcFails.length > 0 && <p className="text-xs text-destructive">Quality check failed: {qcFails.map((c: any) => `${c.name} (${c.detail})`).join('; ')}</p>}
                    {failedJob && !sj && <p className="text-xs text-destructive">{failedJob.error}</p>}
                    <div className="mt-auto pt-2 flex flex-wrap gap-2">
                      <Link href={`/editor?short=${s.id}`} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1"><Scissors className="w-3.5 h-3.5" /> Edit</Link>
                      {s.downloadUrl && s.status === 'ready' && (
                        <a href={s.downloadUrl} className="px-3 py-1.5 rounded-md border text-xs font-semibold flex items-center gap-1 hover:bg-muted"><Download className="w-3.5 h-3.5" /> Download</a>
                      )}
                      <select
                        disabled={Boolean(sj) || busy === `regen_${s.id}`}
                        value=""
                        onChange={(e) => e.target.value && post(`/api/shorts/${s.id}/regenerate`, { duration: Number(e.target.value) }, `regen_${s.id}`)}
                        className="px-2 py-1.5 rounded-md border text-xs bg-background disabled:opacity-50"
                        aria-label="Regenerate clip"
                      >
                        <option value="">Regenerate…</option>
                        {DURATION_PRESETS.map((d) => <option key={d} value={d}>as {d}s</option>)}
                        <option value={Math.round(s.endTime - s.startTime)}>same length</option>
                      </select>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

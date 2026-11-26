'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Play, Pause, Scissors, Trash2, Merge, Maximize2, Loader2, Save, Download, Clapperboard, Plus, Volume2, ZoomIn, ArrowLeft, Wand2, AlertCircle, CheckCircle2, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CAPTION_PRESETS, FONTS, cuesOnOutput, newId, outputSize, outputToSource, segmentOutputDuration, sourceToOutput, totalOutputDuration,
  type CaptionCue, type EditDoc, type Segment, type TextOverlay,
} from '@/lib/render/edit-doc';
import { DURATION_PRESETS } from '@/pipeline/stages';

const fmt = (s: number) => {
  const t = Math.max(0, s);
  const m = Math.floor(t / 60);
  const r = t - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, '0')}`;
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function redistributeWords(cue: CaptionCue, text: string): CaptionCue {
  const tokens = text.split(/\s+/).filter(Boolean);
  const prev = new Map(cue.words.map((w) => [w.text.toLowerCase(), w.highlight]));
  const span = Math.max(0.1, cue.end - cue.start);
  const weights = tokens.map((t) => t.length + 1);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let t = cue.start;
  const words = tokens.map((w, i) => {
    const d = (span * weights[i]) / total;
    const word = { start: t, end: t + d, text: w, highlight: prev.get(w.toLowerCase()) || false };
    t += d;
    return word;
  });
  return { ...cue, text, words };
}

function EditorInner() {
  const params = useSearchParams();
  const shortId = params.get('short');
  const [data, setData] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [doc, setDoc] = useState<EditDoc | null>(null);
  const [title, setTitle] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selSeg, setSelSeg] = useState<string | null>(null);
  const [selCue, setSelCue] = useState<string | null>(null);
  const [tab, setTab] = useState<'format' | 'captions' | 'text' | 'audio' | 'renders'>('captions');
  const [view, setView] = useState<'edit' | 'rendered'>('edit');
  const [outT, setOutT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [vol, setVol] = useState(1);
  const [pxPerSec, setPxPerSec] = useState(24);
  const [boxW, setBoxW] = useState(320);
  const [renderMsg, setRenderMsg] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const docRef = useRef<EditDoc | null>(null);
  docRef.current = doc;

  const load = useCallback(async () => {
    if (!shortId) return;
    const res = await fetch(`/api/shorts/${shortId}`);
    const j = await res.json();
    if (!res.ok) { setLoadError(j.error || 'Could not load this short.'); return; }
    setData(j);
    return j;
  }, [shortId]);

  useEffect(() => {
    load().then((j) => {
      if (!j) return;
      setDoc(j.edit);
      setTitle(j.short.title);
      const total = totalOutputDuration(j.edit);
      setPxPerSec(clamp(Math.floor(800 / Math.max(5, total)), 6, 120));
    });
  }, [load]);

  // Poll while a render/regenerate job is active.
  useEffect(() => {
    if (!data?.job) return;
    const t = setInterval(async () => {
      const j = await load();
      if (j && !j.job) {
        if (j.lastJob?.status === 'failed') setRenderMsg(j.lastJob.error || 'Render failed.');
        else { setRenderMsg(null); setView('rendered'); }
        if (j.lastJob?.type === 'regenerate_short') { setDoc(j.edit); setTitle(j.short.title); setDirty(false); }
      }
    }, 1500);
    return () => clearInterval(t);
  }, [data?.job, load]);

  // Autosave.
  useEffect(() => {
    if (!dirty || !doc) return;
    const t = setTimeout(() => save(), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, doc, title]);

  async function save(): Promise<boolean> {
    if (!doc || !shortId) return false;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/shorts/${shortId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ edit: doc, title }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Save failed');
      setDirty(false);
      setData((d: any) => ({ ...d, short: j.short }));
      return true;
    } catch (err: any) {
      setSaveError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function render() {
    if (dirty && !(await save())) return;
    setRenderMsg(null);
    const res = await fetch(`/api/shorts/${shortId}/render`, { method: 'POST' });
    const j = await res.json();
    if (!res.ok) { setRenderMsg(j.error || 'Could not start render'); return; }
    await load();
  }

  async function regenerate(duration: number) {
    if (dirty && !(await save())) return;
    const res = await fetch(`/api/shorts/${shortId}/regenerate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ duration }) });
    const j = await res.json();
    if (!res.ok) setRenderMsg(j.error);
    await load();
  }

  const update = useCallback((fn: (d: EditDoc) => EditDoc) => {
    setDoc((d) => (d ? fn(structuredClone(d)) : d));
    setDirty(true);
  }, []);

  // ---------------- preview playback through the edit ----------------
  const total = doc ? totalOutputDuration(doc) : 0;
  const sourceDur = data?.source?.probe?.duration || 0;

  const seekOut = useCallback((t: number) => {
    const d = docRef.current;
    const v = videoRef.current;
    if (!d || !v) return;
    const tt = clamp(t, 0, totalOutputDuration(d));
    const m = outputToSource(d, tt);
    if (!m) return;
    v.currentTime = m.source;
    v.playbackRate = m.segment.speed * rate;
    setOutT(tt);
    if (musicRef.current && musicRef.current.duration) musicRef.current.currentTime = tt % musicRef.current.duration;
  }, [rate]);

  const tick = useCallback(() => {
    const d = docRef.current;
    const v = videoRef.current;
    if (!d || !v) return;
    let acc = 0;
    let idx = -1;
    for (let i = 0; i < d.segments.length; i++) {
      const s = d.segments[i];
      if (v.currentTime >= s.start - 0.05 && v.currentTime < s.end - 0.02) { idx = i; break; }
      acc += segmentOutputDuration(s);
    }
    if (idx === -1) {
      // Between segments: jump to the next one in timeline order.
      const cur = outputToSource(d, outRef.current);
      const curIdx = cur ? d.segments.findIndex((s) => s.id === cur.segment.id) : -1;
      const next = d.segments[curIdx + 1];
      if (next) {
        v.currentTime = next.start;
        v.playbackRate = next.speed * rate;
      } else {
        v.pause();
        setPlaying(false);
        setOutT(totalOutputDuration(d));
        musicRef.current?.pause();
        return;
      }
    } else {
      const s = d.segments[idx];
      const t = acc + (v.currentTime - s.start) / s.speed;
      outRef.current = t;
      setOutT(t);
      if (Math.abs(v.playbackRate - s.speed * rate) > 0.01) v.playbackRate = s.speed * rate;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [rate]);
  const outRef = useRef(0);
  outRef.current = outT;

  const play = async () => {
    const v = videoRef.current;
    if (!v || !doc) return;
    if (outT >= total - 0.05) seekOut(0);
    else seekOut(outT);
    await v.play().catch(() => {});
    if (musicRef.current && doc.audio.music) musicRef.current.play().catch(() => {});
    setPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  };
  const pause = () => {
    videoRef.current?.pause();
    musicRef.current?.pause();
    cancelAnimationFrame(rafRef.current);
    setPlaying(false);
  };
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  useEffect(() => {
    const v = videoRef.current;
    if (v && doc) v.volume = clamp(doc.audio.sourceVolume * vol, 0, 1);
    if (musicRef.current && doc?.audio.music) musicRef.current.volume = clamp(doc.audio.music.volume * vol, 0, 1);
  }, [doc, vol]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc?.aspect, view]);

  // Keyboard shortcuts (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play(); }
      if (e.key === 's' || e.key === 'S') splitAtPlayhead();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------------- timeline operations ----------------
  function splitAtPlayhead() {
    if (!doc) return;
    const m = outputToSource(doc, outT);
    if (!m || m.source - m.segment.start < 0.2 || m.segment.end - m.source < 0.2) return;
    update((d) => {
      const i = d.segments.findIndex((s) => s.id === m.segment.id);
      const s = d.segments[i];
      const b: Segment = { id: newId('seg'), start: m.source, end: s.end, speed: s.speed };
      d.segments.splice(i, 1, { ...s, end: m.source }, b);
      return d;
    });
  }
  function deleteSegment(id: string) {
    if (!doc || doc.segments.length <= 1) return;
    update((d) => ({ ...d, segments: d.segments.filter((s) => s.id !== id) }));
    setSelSeg(null);
  }
  function mergeWithNext(id: string) {
    update((d) => {
      const i = d.segments.findIndex((s) => s.id === id);
      const a = d.segments[i], b = d.segments[i + 1];
      if (!a || !b) return d;
      d.segments.splice(i, 2, { ...a, start: Math.min(a.start, b.start), end: Math.max(a.end, b.end) });
      return d;
    });
  }
  function moveSegment(from: number, to: number) {
    if (from === to) return;
    update((d) => {
      const [s] = d.segments.splice(from, 1);
      d.segments.splice(to, 0, s);
      return d;
    });
  }
  function startTrim(e: React.PointerEvent, segId: string, edge: 'start' | 'end') {
    e.stopPropagation();
    e.preventDefault();
    const x0 = e.clientX;
    const seg = doc!.segments.find((s) => s.id === segId)!;
    const orig = { ...seg };
    const onMove = (ev: PointerEvent) => {
      const dSec = ((ev.clientX - x0) / pxPerSec) * orig.speed;
      update((d) => {
        const s = d.segments.find((x) => x.id === segId);
        if (!s) return d;
        if (edge === 'start') s.start = clamp(orig.start + dSec, 0, orig.end - 0.3);
        else s.end = clamp(orig.end + dSec, orig.start + 0.3, sourceDur);
        s.start = Math.round(s.start * 100) / 100;
        s.end = Math.round(s.end * 100) / 100;
        return d;
      });
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // ---------------- derived ----------------
  const cues = useMemo(() => (doc ? cuesOnOutput(doc) : []), [doc]);
  const activeCue = cues.find((c) => outT >= c.outStart && outT < c.outEnd);
  const out = doc ? outputSize(doc.aspect) : { width: 1080, height: 1920 };
  const scale = boxW / out.width;
  const probe = data?.source?.probe;

  const videoStyle = useMemo<React.CSSProperties>(() => {
    if (!doc || !probe) return {};
    if (doc.framing.mode !== 'crop') return { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' };
    const targetAr = out.width / out.height;
    const srcAr = probe.width / probe.height;
    const zoom = clamp(doc.framing.zoom || 1, 1, 3);
    let cw: number, ch: number;
    if (srcAr > targetAr) { ch = probe.height / zoom; cw = ch * targetAr; } else { cw = probe.width / zoom; ch = cw / targetAr; }
    const x = (probe.width - cw) * doc.framing.focusX;
    const y = (probe.height - ch) * doc.framing.focusY;
    const k = boxW / cw;
    return { position: 'absolute', width: probe.width * k, height: probe.height * k, left: -x * k, top: -y * k, maxWidth: 'none' };
  }, [doc, probe, boxW, out.width, out.height]);

  if (!shortId) return <ShortPicker />;
  if (loadError) return <p className="text-sm text-destructive">{loadError}</p>;
  if (!data || !doc) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading editor…</div>;

  const style = doc.captions.style;
  const job = data.job;
  const selCueObj = doc.captions.cues.find((c) => c.id === selCue);
  const wf = data.waveform as { start: number; perSecond: number; peaks: number[] } | null;
  const music = data.music as Array<{ id: string; title: string; url: string }>;
  const musicUrl = doc.audio.music ? music.find((m) => m.id === doc.audio.music!.trackId)?.url : null;

  const captionPos: React.CSSProperties =
    style.position === 'top' ? { top: '12%' } : style.position === 'middle' ? { top: '50%', transform: 'translateY(-50%)' } : { bottom: '20%' };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <Link href={`/projects/${data.project.id}`} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> {data.project.title}</Link>
          <input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} className="w-full bg-transparent text-xl font-extrabold tracking-tight outline-none focus:bg-muted rounded px-1 -mx-1" aria-label="Short title" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground w-20 text-right">{saving ? 'Saving…' : dirty ? 'Unsaved' : 'Saved'}</span>
          <button onClick={save} disabled={!dirty || saving} className="px-3 py-2 rounded-lg border text-sm font-semibold flex items-center gap-1.5 disabled:opacity-40"><Save className="w-4 h-4" /> Save</button>
          <button onClick={render} disabled={Boolean(job)} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold flex items-center gap-1.5 disabled:opacity-50">
            {job ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clapperboard className="w-4 h-4" />}
            {job ? `${job.type === 'regenerate_short' ? 'Regenerating' : 'Rendering'} ${job.progress}%` : 'Render'}
          </button>
          {data.short.downloadUrl && data.short.status === 'ready' && !dirty && (
            <a href={data.short.downloadUrl} className="px-3 py-2 rounded-lg border text-sm font-semibold flex items-center gap-1.5 hover:bg-muted"><Download className="w-4 h-4" /> MP4</a>
          )}
        </div>
      </div>
      {saveError && <p className="text-sm text-destructive flex gap-1.5"><AlertCircle className="w-4 h-4 mt-0.5" />{saveError}</p>}
      {renderMsg && <p className="text-sm text-destructive flex gap-1.5"><AlertCircle className="w-4 h-4 mt-0.5" />{renderMsg}</p>}
      {job?.message && <p className="text-xs text-muted-foreground">{job.message}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Preview */}
        <div className="space-y-2">
          <div className="flex gap-1 text-xs">
            {(['edit', 'rendered'] as const).map((v) => (
              <button key={v} onClick={() => { pause(); setView(v); }} disabled={v === 'rendered' && !data.short.videoUrl} className={cn('px-3 py-1 rounded-md border font-semibold disabled:opacity-40', view === v ? 'bg-foreground text-background' : 'hover:bg-muted')}>
                {v === 'edit' ? 'Live preview' : 'Rendered MP4'}
              </button>
            ))}
          </div>
          <div ref={stageRef} className="rounded-xl bg-black/90 p-3 flex justify-center">
            {view === 'rendered' && data.short.videoUrl ? (
              <video key={data.short.videoUrl} src={data.short.videoUrl} controls className="max-h-[68vh] max-w-full rounded" />
            ) : (
              <div ref={frameRef} className="relative overflow-hidden bg-black rounded" style={{ aspectRatio: `${out.width} / ${out.height}`, height: doc.aspect === '16:9' ? 'auto' : 'min(68vh, 680px)', width: doc.aspect === '16:9' ? '100%' : 'auto' }}>
                {doc.framing.mode === 'blur' && data.source.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={data.source.thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-70" />
                )}
                <video ref={videoRef} src={data.source.previewUrl || undefined} preload="auto" playsInline style={videoStyle} onLoadedMetadata={() => seekOut(outT)} />
                {doc.captions.enabled && activeCue && (
                  <div className="absolute left-[6%] right-[6%] text-center pointer-events-none" style={captionPos}>
                    <span
                      style={{
                        fontFamily: `'${style.font}', sans-serif`,
                        fontSize: style.size * scale,
                        lineHeight: 1.15,
                        color: style.color,
                        textTransform: style.uppercase ? 'uppercase' : 'none',
                        background: style.background === 'box' ? 'rgba(0,0,0,0.62)' : 'transparent',
                        padding: style.background === 'box' ? `${4 * scale}px ${12 * scale}px` : 0,
                        WebkitTextStroke: style.background === 'box' ? undefined : `${Math.max(1, style.size * 0.06 * scale)}px ${style.outlineColor}`,
                        paintOrder: 'stroke fill',
                        textShadow: style.background === 'shadow' ? `0 ${3 * scale}px ${6 * scale}px rgba(0,0,0,.7)` : undefined,
                        borderRadius: 6 * scale,
                      }}
                    >
                      {activeCue.words.length
                        ? activeCue.words.map((w, i) => {
                            const on = style.animation === 'karaoke' ? outT >= w.start && outT < w.end : w.highlight;
                            return <span key={i} style={{ color: on ? style.highlightColor : undefined }}>{w.text}{i < activeCue.words.length - 1 ? ' ' : ''}</span>;
                          })
                        : activeCue.text}
                    </span>
                  </div>
                )}
                {doc.texts.filter((t) => outT >= t.start && outT <= t.end).map((t) => (
                  <div key={t.id} className="absolute pointer-events-none whitespace-pre text-center" style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%`, transform: 'translate(-50%,-50%)', fontFamily: `'${t.font}', sans-serif`, fontSize: t.size * scale, color: t.color, background: t.box ? 'rgba(0,0,0,.6)' : undefined, padding: t.box ? `${4 * scale}px ${12 * scale}px` : undefined, WebkitTextStroke: t.box ? undefined : `${Math.max(1, 3 * scale)}px #000`, paintOrder: 'stroke fill' }}>{t.text}</div>
                ))}
                {musicUrl && <audio ref={musicRef} src={musicUrl} loop preload="auto" />}
              </div>
            )}
          </div>

          {view === 'edit' && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <button onClick={() => (playing ? pause() : play())} className="p-2 rounded-lg bg-foreground text-background" aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}</button>
              <span className="tabular-nums text-xs w-28">{fmt(outT)} / {fmt(total)}</span>
              <input type="range" min={0} max={total} step={0.05} value={Math.min(outT, total)} onChange={(e) => { pause(); seekOut(Number(e.target.value)); }} className="flex-1 min-w-[120px] accent-[var(--primary)]" aria-label="Seek" />
              <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className="px-1.5 py-1 rounded border bg-background text-xs" aria-label="Preview speed">
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => <option key={r} value={r}>{r}×</option>)}
              </select>
              <span className="flex items-center gap-1"><Volume2 className="w-4 h-4 text-muted-foreground" /><input type="range" min={0} max={1} step={0.05} value={vol} onChange={(e) => setVol(Number(e.target.value))} className="w-20 accent-[var(--primary)]" aria-label="Preview volume" /></span>
              <button onClick={() => stageRef.current?.requestFullscreen?.()} className="p-2 rounded-lg border hover:bg-muted" aria-label="Fullscreen"><Maximize2 className="w-4 h-4" /></button>
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="rounded-xl border bg-card">
          <div className="flex border-b text-xs font-semibold overflow-x-auto">
            {(['captions', 'format', 'text', 'audio', 'renders'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={cn('px-3 py-2.5 capitalize whitespace-nowrap', tab === t ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground')}>{t}</button>
            ))}
          </div>
          <div className="p-3 space-y-3 max-h-[70vh] overflow-y-auto text-sm">
            {tab === 'captions' && (
              <>
                <label className="flex items-center gap-2"><input type="checkbox" checked={doc.captions.enabled} onChange={(e) => update((d) => ({ ...d, captions: { ...d.captions, enabled: e.target.checked } }))} /> Show captions</label>
                {!doc.captions.cues.length && <p className="text-xs text-muted-foreground">No speech was transcribed in this clip. Add captions manually below.</p>}
                <Field label="Preset">
                  <select className="input" value="" onChange={(e) => e.target.value && update((d) => ({ ...d, captions: { ...d.captions, style: { ...CAPTION_PRESETS[e.target.value] } } }))}>
                    <option value="">Apply a preset…</option>
                    {Object.keys(CAPTION_PRESETS).map((k) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Font"><select className="input" value={style.font} onChange={(e) => update((d) => { d.captions.style.font = e.target.value; return d; })}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select></Field>
                  <Field label={`Size ${style.size}`}><input type="range" min={36} max={140} value={style.size} onChange={(e) => update((d) => { d.captions.style.size = Number(e.target.value); return d; })} className="w-full" /></Field>
                  <Field label="Text color"><input type="color" value={style.color} onChange={(e) => update((d) => { d.captions.style.color = e.target.value; return d; })} className="h-8 w-full" /></Field>
                  <Field label="Highlight color"><input type="color" value={style.highlightColor} onChange={(e) => update((d) => { d.captions.style.highlightColor = e.target.value; return d; })} className="h-8 w-full" /></Field>
                  <Field label="Background"><select className="input" value={style.background} onChange={(e) => update((d) => { d.captions.style.background = e.target.value as any; return d; })}><option value="shadow">Outline + shadow</option><option value="box">Box</option><option value="none">Outline only</option></select></Field>
                  <Field label="Position"><select className="input" value={style.position} onChange={(e) => update((d) => { d.captions.style.position = e.target.value as any; return d; })}><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></select></Field>
                  <Field label="Animation"><select className="input" value={style.animation} onChange={(e) => update((d) => { d.captions.style.animation = e.target.value as any; return d; })}><option value="pop">Pop</option><option value="karaoke">Karaoke (word by word)</option><option value="fade">Fade</option><option value="none">None</option></select></Field>
                  <label className="flex items-center gap-2 text-xs mt-5"><input type="checkbox" checked={style.uppercase} onChange={(e) => update((d) => { d.captions.style.uppercase = e.target.checked; return d; })} /> UPPERCASE</label>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-bold uppercase text-muted-foreground">Captions ({doc.captions.cues.length})</span>
                  <button className="text-xs font-semibold text-primary flex items-center gap-1" onClick={() => {
                    const m = outputToSource(doc, outT);
                    if (!m) return;
                    const start = m.source;
                    const end = Math.min(m.segment.end, start + 1.5);
                    const cue = redistributeWords({ id: newId('cue'), start, end, text: '', words: [] }, 'New caption');
                    update((d) => { d.captions.cues.push(cue); d.captions.cues.sort((a, b) => a.start - b.start); d.captions.enabled = true; return d; });
                    setSelCue(cue.id);
                  }}><Plus className="w-3 h-3" /> Add at playhead</button>
                </div>
                <ul className="space-y-1.5">
                  {doc.captions.cues.map((c) => {
                    const os = sourceToOutput(doc, c.start);
                    return (
                      <li key={c.id} className={cn('rounded-md border p-2 space-y-1', selCue === c.id && 'border-primary')} onClick={() => { setSelCue(c.id); if (os !== null) { pause(); seekOut(os); } }}>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <span className="tabular-nums">{os === null ? 'cut out' : fmt(os)}</span>
                          <span className="ml-auto flex gap-1">
                            <button className="px-1 rounded hover:bg-muted" onClick={(e) => { e.stopPropagation(); update((d) => { const x = d.captions.cues.find((y) => y.id === c.id)!; x.start -= 0.1; x.end -= 0.1; x.words.forEach((w) => { w.start -= 0.1; w.end -= 0.1; }); return d; }); }}>−0.1s</button>
                            <button className="px-1 rounded hover:bg-muted" onClick={(e) => { e.stopPropagation(); update((d) => { const x = d.captions.cues.find((y) => y.id === c.id)!; x.start += 0.1; x.end += 0.1; x.words.forEach((w) => { w.start += 0.1; w.end += 0.1; }); return d; }); }}>+0.1s</button>
                            <button className="px-1 rounded hover:bg-muted text-destructive" onClick={(e) => { e.stopPropagation(); update((d) => ({ ...d, captions: { ...d.captions, cues: d.captions.cues.filter((y) => y.id !== c.id) } })); }} aria-label="Delete caption"><Trash2 className="w-3 h-3" /></button>
                          </span>
                        </div>
                        {selCue === c.id ? (
                          <>
                            <input className="input" value={c.text} onChange={(e) => update((d) => { const i = d.captions.cues.findIndex((y) => y.id === c.id); d.captions.cues[i] = redistributeWords(d.captions.cues[i], e.target.value); return d; })} />
                            <div className="flex flex-wrap gap-1">
                              {c.words.map((w, i) => (
                                <button key={i} title="Toggle highlight" onClick={(e) => { e.stopPropagation(); update((d) => { const x = d.captions.cues.find((y) => y.id === c.id)!; x.words[i].highlight = !x.words[i].highlight; return d; }); }} className={cn('px-1.5 py-0.5 rounded text-xs border', w.highlight ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}>{w.text}</button>
                              ))}
                            </div>
                            <p className="text-[10px] text-muted-foreground">Click a word to highlight it.</p>
                          </>
                        ) : (
                          <p className="text-sm">{c.text}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {tab === 'format' && (
              <>
                <Field label="Aspect ratio">
                  <div className="flex gap-1.5">
                    {(['9:16', '1:1', '16:9'] as const).map((a) => <button key={a} onClick={() => update((d) => ({ ...d, aspect: a }))} className={cn('px-3 py-1.5 rounded-md border text-xs font-semibold', doc.aspect === a ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}>{a}</button>)}
                  </div>
                </Field>
                <Field label="Framing">
                  <select className="input" value={doc.framing.mode} onChange={(e) => update((d) => { d.framing.mode = e.target.value as any; return d; })}>
                    <option value="crop">Crop to fill</option>
                    <option value="fit">Fit with black bars</option>
                    <option value="blur">Fit on blurred background</option>
                  </select>
                </Field>
                {doc.framing.mode === 'crop' && (
                  <>
                    <Field label={`Horizontal position ${Math.round(doc.framing.focusX * 100)}%`}><input type="range" min={0} max={1} step={0.01} value={doc.framing.focusX} onChange={(e) => update((d) => { d.framing.focusX = Number(e.target.value); return d; })} className="w-full" /></Field>
                    <Field label={`Vertical position ${Math.round(doc.framing.focusY * 100)}%`}><input type="range" min={0} max={1} step={0.01} value={doc.framing.focusY} onChange={(e) => update((d) => { d.framing.focusY = Number(e.target.value); return d; })} className="w-full" /></Field>
                    <Field label={`Zoom ${doc.framing.zoom.toFixed(2)}×`}><input type="range" min={1} max={3} step={0.05} value={doc.framing.zoom} onChange={(e) => update((d) => { d.framing.zoom = Number(e.target.value); return d; })} className="w-full" /></Field>
                  </>
                )}
                <p className="text-xs text-muted-foreground">Output: {out.width}×{out.height}, H.264 + AAC, 30 fps.</p>
                <div className="border-t pt-3 space-y-2">
                  <p className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1"><Wand2 className="w-3 h-3" /> Regenerate this clip with AI</p>
                  <div className="flex flex-wrap gap-1.5">
                    {DURATION_PRESETS.map((d) => <button key={d} disabled={Boolean(job)} onClick={() => regenerate(d)} className="px-3 py-1.5 rounded-md border text-xs font-semibold hover:bg-muted disabled:opacity-40">{d}s</button>)}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Picks a fresh moment near this one, re-captions and re-renders. Your style settings are kept; timeline edits and text overlays are replaced.</p>
                </div>
              </>
            )}

            {tab === 'text' && (
              <>
                <button className="w-full py-2 rounded-md border text-xs font-semibold flex items-center justify-center gap-1 hover:bg-muted" onClick={() => update((d) => { d.texts.push({ id: newId('txt'), text: 'Your text', start: outT, end: Math.min(total, outT + 3), x: 0.5, y: 0.15, size: 72, color: '#FFFFFF', font: 'Anton', box: true }); return d; })}>
                  <Plus className="w-3.5 h-3.5" /> Add text at playhead
                </button>
                {doc.texts.map((t, i) => (
                  <div key={t.id} className="rounded-md border p-2 space-y-2">
                    <div className="flex gap-1">
                      <input className="input flex-1" value={t.text} onChange={(e) => update((d) => { d.texts[i].text = e.target.value; return d; })} />
                      <button onClick={() => update((d) => ({ ...d, texts: d.texts.filter((x) => x.id !== t.id) }))} className="p-1.5 rounded hover:bg-muted text-destructive" aria-label="Delete text"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label={`From ${t.start.toFixed(1)}s`}><input type="range" min={0} max={total} step={0.1} value={t.start} onChange={(e) => update((d) => { d.texts[i].start = Math.min(Number(e.target.value), d.texts[i].end - 0.2); return d; })} className="w-full" /></Field>
                      <Field label={`To ${t.end.toFixed(1)}s`}><input type="range" min={0} max={total} step={0.1} value={t.end} onChange={(e) => update((d) => { d.texts[i].end = Math.max(Number(e.target.value), d.texts[i].start + 0.2); return d; })} className="w-full" /></Field>
                      <Field label={`X ${Math.round(t.x * 100)}%`}><input type="range" min={0} max={1} step={0.01} value={t.x} onChange={(e) => update((d) => { d.texts[i].x = Number(e.target.value); return d; })} className="w-full" /></Field>
                      <Field label={`Y ${Math.round(t.y * 100)}%`}><input type="range" min={0} max={1} step={0.01} value={t.y} onChange={(e) => update((d) => { d.texts[i].y = Number(e.target.value); return d; })} className="w-full" /></Field>
                      <Field label="Font"><select className="input" value={t.font} onChange={(e) => update((d) => { d.texts[i].font = e.target.value; return d; })}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select></Field>
                      <Field label={`Size ${t.size}`}><input type="range" min={24} max={200} value={t.size} onChange={(e) => update((d) => { d.texts[i].size = Number(e.target.value); return d; })} className="w-full" /></Field>
                      <Field label="Color"><input type="color" value={t.color} onChange={(e) => update((d) => { d.texts[i].color = e.target.value; return d; })} className="h-8 w-full" /></Field>
                      <label className="flex items-center gap-2 text-xs mt-5"><input type="checkbox" checked={t.box} onChange={(e) => update((d) => { d.texts[i].box = e.target.checked; return d; })} /> Background box</label>
                    </div>
                  </div>
                ))}
              </>
            )}

            {tab === 'audio' && (
              <>
                <Field label={`Original audio ${Math.round(doc.audio.sourceVolume * 100)}%`}><input type="range" min={0} max={2} step={0.05} value={doc.audio.sourceVolume} onChange={(e) => update((d) => { d.audio.sourceVolume = Number(e.target.value); return d; })} className="w-full" /></Field>
                <Field label="Background music (royalty-free library)">
                  <select className="input" value={doc.audio.music?.trackId || ''} onChange={(e) => update((d) => { d.audio.music = e.target.value ? { trackId: e.target.value, volume: d.audio.music?.volume ?? 0.25, duck: d.audio.music?.duck ?? true } : null; return d; })}>
                    <option value="">None</option>
                    {music.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                  </select>
                </Field>
                {doc.audio.music && (
                  <>
                    <Field label={`Music volume ${Math.round(doc.audio.music.volume * 100)}%`}><input type="range" min={0} max={1.5} step={0.05} value={doc.audio.music.volume} onChange={(e) => update((d) => { d.audio.music!.volume = Number(e.target.value); return d; })} className="w-full" /></Field>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={doc.audio.music.duck} onChange={(e) => update((d) => { d.audio.music!.duck = e.target.checked; return d; })} /> Lower music while people talk (ducking)</label>
                    <p className="text-[11px] text-muted-foreground">Ducking is applied in the render; the live preview plays music at a fixed level.</p>
                  </>
                )}
              </>
            )}

            {tab === 'renders' && (
              <ul className="space-y-2">
                {!data.renders.length && <p className="text-xs text-muted-foreground">No renders yet.</p>}
                {data.renders.map((r: any) => (
                  <li key={r.id} className="rounded-md border p-2 text-xs flex items-center gap-2">
                    {r.status === 'completed' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : r.status === 'failed' ? <XCircle className="w-4 h-4 text-destructive" /> : <Loader2 className="w-4 h-4 animate-spin" />}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">Edit v{r.editVersion} · {new Date(r.createdAt).toLocaleString()}</p>
                      <p className="text-muted-foreground truncate">{r.status === 'failed' ? r.error : r.duration ? `${r.duration.toFixed(1)}s · ${(r.fileSize / 1048576).toFixed(1)} MB` : r.status}</p>
                    </div>
                    {r.status === 'completed' && r.downloadUrl && <a href={r.downloadUrl} className="p-1.5 rounded hover:bg-muted" aria-label="Download render"><Download className="w-4 h-4" /></a>}
                  </li>
                ))}
                {data.short.qc && (
                  <li className="rounded-md border p-2 text-xs space-y-1">
                    <p className="font-semibold">Latest quality check: {data.short.qc.passed ? 'passed' : 'failed'}</p>
                    {data.short.qc.checks.map((c: any) => <p key={c.name} className={c.ok ? 'text-muted-foreground' : c.severity === 'error' ? 'text-destructive' : 'text-amber-600'}>{c.ok ? '✓' : '✗'} {c.name}: {c.detail}</p>)}
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-xl border bg-card p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold uppercase text-muted-foreground mr-2">Timeline</span>
          <button onClick={splitAtPlayhead} className="px-2 py-1 rounded border flex items-center gap-1 hover:bg-muted" title="Split at playhead (S)"><Scissors className="w-3.5 h-3.5" /> Split</button>
          <button onClick={() => selSeg && deleteSegment(selSeg)} disabled={!selSeg || doc.segments.length <= 1} className="px-2 py-1 rounded border flex items-center gap-1 hover:bg-muted disabled:opacity-40"><Trash2 className="w-3.5 h-3.5" /> Remove section</button>
          <button onClick={() => selSeg && mergeWithNext(selSeg)} disabled={!selSeg || doc.segments.findIndex((s) => s.id === selSeg) >= doc.segments.length - 1} className="px-2 py-1 rounded border flex items-center gap-1 hover:bg-muted disabled:opacity-40"><Merge className="w-3.5 h-3.5" /> Merge with next</button>
          {selSeg && (
            <label className="flex items-center gap-1">Speed
              <select value={doc.segments.find((s) => s.id === selSeg)?.speed ?? 1} onChange={(e) => update((d) => { const s = d.segments.find((x) => x.id === selSeg); if (s) s.speed = Number(e.target.value); return d; })} className="px-1 py-0.5 rounded border bg-background">
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => <option key={r} value={r}>{r}×</option>)}
              </select>
            </label>
          )}
          <span className="ml-auto flex items-center gap-1"><ZoomIn className="w-3.5 h-3.5" /><input type="range" min={4} max={160} value={pxPerSec} onChange={(e) => setPxPerSec(Number(e.target.value))} className="w-28" aria-label="Timeline zoom" /></span>
        </div>
        <div className="overflow-x-auto pb-1">
          <div ref={trackRef} className="relative" style={{ width: Math.max(total * pxPerSec + 40, 300) }}
            onClick={(e) => { const r = trackRef.current!.getBoundingClientRect(); pause(); seekOut((e.clientX - r.left) / pxPerSec); }}>
            {/* video/audio segments */}
            <div className="flex h-16">
              {doc.segments.map((s, i) => {
                const w = segmentOutputDuration(s) * pxPerSec;
                return (
                  <div key={s.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); moveSegment(Number(e.dataTransfer.getData('text/plain')), i); }}
                    onClick={(e) => { e.stopPropagation(); setSelSeg(s.id); const r = trackRef.current!.getBoundingClientRect(); pause(); seekOut((e.clientX - r.left) / pxPerSec); }}
                    className={cn('relative h-full border-r-2 border-card rounded-sm overflow-hidden cursor-grab', selSeg === s.id ? 'bg-primary/35 ring-2 ring-primary' : 'bg-primary/15')}
                    style={{ width: w }}
                    title={`Source ${fmt(s.start)}–${fmt(s.end)}${s.speed !== 1 ? ` at ${s.speed}×` : ''}. Drag to reorder.`}
                  >
                    <Waveform wf={wf} start={s.start} end={s.end} width={w} />
                    <span className="absolute top-0.5 left-2 text-[10px] font-semibold text-foreground/80 pointer-events-none">{fmt(s.start)}{s.speed !== 1 && ` · ${s.speed}×`}</span>
                    <div onPointerDown={(e) => startTrim(e, s.id, 'start')} className="absolute left-0 top-0 bottom-0 w-2 bg-primary/70 cursor-ew-resize" title="Trim start" />
                    <div onPointerDown={(e) => startTrim(e, s.id, 'end')} className="absolute right-0 top-0 bottom-0 w-2 bg-primary/70 cursor-ew-resize" title="Trim end" />
                  </div>
                );
              })}
            </div>
            {/* captions track */}
            <div className="relative h-6 mt-1">
              {cues.map((c, i) => (
                <div key={`${c.id}_${i}`} onClick={(e) => { e.stopPropagation(); setTab('captions'); setSelCue(c.id); pause(); seekOut(c.outStart); }}
                  className={cn('absolute top-0 h-full rounded-sm text-[10px] px-1 truncate cursor-pointer border', selCue === c.id ? 'bg-amber-300/70 border-amber-500' : 'bg-amber-200/40 border-amber-300/60')}
                  style={{ left: c.outStart * pxPerSec, width: Math.max(4, (c.outEnd - c.outStart) * pxPerSec) }} title={c.text}>{c.text}</div>
              ))}
            </div>
            {/* text overlays track */}
            {doc.texts.length > 0 && (
              <div className="relative h-5 mt-1">
                {doc.texts.map((t) => (
                  <div key={t.id} onClick={(e) => { e.stopPropagation(); setTab('text'); }} className="absolute top-0 h-full rounded-sm text-[10px] px-1 truncate bg-sky-300/50 border border-sky-400/60 cursor-pointer" style={{ left: t.start * pxPerSec, width: Math.max(4, (t.end - t.start) * pxPerSec) }}>{t.text}</div>
                ))}
              </div>
            )}
            <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none" style={{ left: outT * pxPerSec }} />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">Drag a section to reorder it, drag its edges to trim, press S to split at the playhead, Space to play.</p>
      </div>
    </div>
  );
}

function Waveform({ wf, start, end, width }: { wf: { start: number; perSecond: number; peaks: number[] } | null; start: number; end: number; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !wf) return;
    const w = Math.max(1, Math.floor(width));
    const h = 64;
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,136,130,0.85)';
    for (let x = 0; x < w; x++) {
      const t = start + ((end - start) * x) / w;
      const i = Math.floor((t - wf.start) * wf.perSecond);
      const v = wf.peaks[i] ?? 0;
      const bh = Math.max(1, v * (h - 14));
      ctx.fillRect(x, h - 2 - bh, 1, bh);
    }
  }, [wf, start, end, width]);
  if (!wf) return null;
  return <canvas ref={ref} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ShortPicker() {
  const [projects, setProjects] = useState<any[] | null>(null);
  useEffect(() => {
    fetch('/api/projects').then((r) => r.json()).then((j) => setProjects(j.projects || [])).catch(() => setProjects([]));
  }, []);
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-extrabold tracking-tight">Video editor</h1>
      <p className="text-sm text-muted-foreground">Open a project and choose <span className="font-semibold">Edit</span> on one of its shorts.</p>
      {!projects ? <Loader2 className="w-4 h-4 animate-spin" /> : (
        <ul className="divide-y rounded-xl border bg-card">
          {projects.slice(0, 30).map((p) => (
            <li key={p.id}><Link href={`/projects/${p.id}`} className="flex justify-between gap-2 p-3 hover:bg-muted text-sm"><span className="truncate font-medium">{p.title}</span><span className="text-xs text-muted-foreground shrink-0">{p.status}</span></Link></li>
          ))}
          {!projects.length && <li className="p-3 text-sm text-muted-foreground">No projects yet. <Link href="/" className="text-primary underline">Create one</Link>.</li>}
        </ul>
      )}
    </div>
  );
}

export default function EditorPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading editor…</div>}>
      <EditorInner />
    </Suspense>
  );
}

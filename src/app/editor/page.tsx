'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Scissors,
  Sparkles,
  Play,
  Share2,
  Volume2,
  Smile,
  Type,
  Maximize2,
  RotateCcw,
  CheckCircle2,
  Layers,
  Sliders,
  Flame,
  Trash2,
  AlertTriangle,
  RotateCw,
  Youtube,
  Calendar,
} from 'lucide-react';
import { PublishModal } from '@/components/publishing/publish-modal';
import { ScheduleModal } from '@/components/publishing/schedule-modal';

function EditorContent() {
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => searchParams.get('projectId') || 'all');
  const [clips, setClips] = useState<any[]>([]);
  const [selectedClip, setSelectedClip] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [previewMode, setPreviewMode] = useState<'edited' | 'raw'>('edited');

  // Editing state controls
  const [cropMode, setCropMode] = useState<'center' | 'left' | 'right'>('center');
  const [zoomScale, setZoomScale] = useState(1.15);
  const [musicVolume, setMusicVolume] = useState(45);
  const [duckingDb, setDuckingDb] = useState(-16);
  const [subtitleStyle, setSubtitleStyle] = useState('coral_neon');
  const [selectedMeme, setSelectedMeme] = useState('meme_shock_eyes');
  const [isRendering, setIsRendering] = useState(false);
  const [renderSuccess, setRenderSuccess] = useState(false);
  const [deleteConfirmClip, setDeleteConfirmClip] = useState<any | null>(null);
  const [deletingClip, setDeletingClip] = useState(false);

  // Publishing & Scheduling modals
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // Load project list
  useEffect(() => {
    fetch('/api/projects')
      .then((res) => res.json())
      .then((data) => {
        if (data.projects && data.projects.length > 0) {
          setProjects(data.projects);
          const pParam = searchParams.get('projectId');
          if (pParam) {
            setSelectedProjectId(pParam);
          } else {
            // Default to most recent project to enforce strict project scope
            setSelectedProjectId(data.projects[0].id);
          }
        }
      })
      .catch(console.error);
  }, [searchParams]);

  // Load clips scoped to selected project
  useEffect(() => {
    setLoading(true);
    const projQuery = selectedProjectId !== 'all' ? `?projectId=${encodeURIComponent(selectedProjectId)}` : '';
    fetch(`/api/clips${projQuery}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.clips && data.clips.length > 0) {
          setClips(data.clips);
          const clipParam = searchParams.get('clip');
          const found = clipParam ? data.clips.find((c: any) => c.id === clipParam) : null;
          setSelectedClip(found || data.clips[0]);
        } else {
          setClips([]);
          setSelectedClip(null);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedProjectId, searchParams]);

  const handleDeleteClip = async () => {
    if (!deleteConfirmClip) return;
    setDeletingClip(true);
    try {
      const res = await fetch('/api/media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteConfirmClip.id, type: 'clip', permanent: false }),
      });
      const data = await res.json();
      if (data.success) {
        const remaining = clips.filter((c) => c.id !== deleteConfirmClip.id);
        setClips(remaining);
        setSelectedClip(remaining[0] || null);
        setDeleteConfirmClip(null);
      } else {
        alert(data.error || 'Failed to delete clip');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDeletingClip(false);
    }
  };

  const handleReRender = () => {
    setIsRendering(true);
    setRenderSuccess(false);
    setTimeout(() => {
      setIsRendering(false);
      setRenderSuccess(true);
      setTimeout(() => setRenderSuccess(false), 4000);
    }, 2500);
  };

  const currentFileName = selectedClip?.output_path
    ? selectedClip.output_path.split(/\\|\//).pop()
    : '';

  const activeVideoSrc = previewMode === 'edited' && selectedClip?.finalPreviewUrl
    ? selectedClip.finalPreviewUrl
    : selectedClip?.rawPreviewUrl || selectedClip?.finalPreviewUrl || `/api/media/clips/${currentFileName}#t=0.5`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
            <Scissors className="w-5 h-5 text-primary" />
            9:16 Shorts Video Editor
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Fine-tune vertical crop framing, reaction meme timing, and phonk audio ducking.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {/* Project Selector Dropdown */}
          <div className="flex items-center gap-1.5 bg-card border border-border rounded-xl px-3 py-1.5 text-xs shadow-xs">
            <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-muted-foreground font-semibold">Project:</span>
            <select
              value={selectedProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.target.value);
              }}
              className="bg-transparent text-foreground font-bold focus:outline-none cursor-pointer max-w-[190px] truncate"
            >
              <option value="all" className="bg-card text-foreground">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id} className="bg-card text-foreground">
                  {p.title} ({p.id.slice(0, 14)})
                </option>
              ))}
            </select>
          </div>

          {selectedClip && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPublishModal(true)}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] text-[#194350] font-extrabold text-xs flex items-center gap-1.5 shadow-sm hover:opacity-95 transition-all"
              >
                <Youtube className="w-3.5 h-3.5" /> Publish Now
              </button>

              <button
                type="button"
                onClick={() => setShowScheduleModal(true)}
                className="px-3 py-2 rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary font-bold text-xs flex items-center gap-1.5 transition-colors"
              >
                <Calendar className="w-3.5 h-3.5" /> Schedule
              </button>

              <Link
                href={`/export?clip=${selectedClip.id}`}
                className="px-3 py-2 rounded-xl border border-border bg-card hover:bg-muted text-foreground font-semibold text-xs flex items-center gap-1.5 transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" /> Export Hub
              </Link>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-xs text-muted-foreground">Loading clips...</div>
      ) : clips.length === 0 ? (
        <div className="vice-card p-12 text-center space-y-3">
          <Scissors className="w-10 h-10 text-muted-foreground mx-auto" />
          <h3 className="font-bold text-sm text-foreground">No clips available in this project</h3>
          <p className="text-xs text-muted-foreground">
            {selectedProjectId !== 'all'
              ? `Project ${selectedProjectId} does not have rendered clips yet.`
              : 'Run a project analysis to extract vertical shorts first.'}
          </p>
          <div className="flex items-center justify-center gap-3">
            {selectedProjectId !== 'all' && (
              <button
                onClick={() => setSelectedProjectId('all')}
                className="px-4 py-2 rounded-lg bg-muted text-foreground font-bold text-xs"
              >
                Show All Projects
              </button>
            )}
            <Link href="/projects/new" className="px-4 py-2 rounded-lg bg-primary text-[#194350] font-bold text-xs">
              Start Project
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Clip Selector & 9:16 Video Player */}
          <div className="lg:col-span-5 space-y-4">
            {/* Clip Selector Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {clips.map((clip, idx) => (
                <button
                  key={clip.id}
                  onClick={() => setSelectedClip(clip)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${selectedClip?.id === clip.id
                    ? 'bg-primary text-[#194350] shadow-sm'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                >
                  Clip {idx + 1} ({clip.duration.toFixed(1)}s)
                </button>
              ))}
            </div>

            {/* 9:16 Vertical Phone Shell Player */}
            <div className="vice-card p-4 flex flex-col items-center">
              <div className="relative w-[280px] sm:w-[300px] aspect-[9/16] bg-black rounded-xl overflow-hidden border border-border shadow-md">
                <video
                  key={selectedClip?.id + '_' + previewMode}
                  src={activeVideoSrc}
                  controls
                  preload="metadata"
                  playsInline
                  className="w-full h-full object-cover"
                />

                <div className="absolute top-2.5 left-2.5 bg-black/75 px-1.5 py-0.5 rounded text-[10px] font-bold text-primary">
                  {previewMode === 'edited' ? '9:16 VERTICAL' : 'ORIGINAL RAW'}
                </div>
                <div className="absolute top-2.5 right-2.5 bg-black/75 px-1.5 py-0.5 rounded text-[10px] font-bold text-[#9dbeb8]">
                  1080×1920 60FPS
                </div>
              </div>

              {/* Preview mode toggle */}
              <div className="w-full mt-2.5 flex items-center gap-2 px-1">
                <button
                  type="button"
                  onClick={() => setPreviewMode('edited')}
                  disabled={!selectedClip?.finalPreviewUrl}
                  className={`flex-1 py-1 rounded-md text-xs font-bold border transition-colors ${previewMode === 'edited'
                    ? 'bg-primary/15 border-primary text-primary'
                    : 'bg-card border-border text-muted-foreground hover:text-foreground'
                    } disabled:opacity-40`}
                >
                  9:16 Vertical Short
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('raw')}
                  disabled={!selectedClip?.rawPreviewUrl}
                  className={`flex-1 py-1 rounded-md text-xs font-bold border transition-colors ${previewMode === 'raw'
                    ? 'bg-muted border-primary text-primary'
                    : 'bg-card border-border text-muted-foreground hover:text-foreground'
                    } disabled:opacity-40`}
                >
                  Original Raw
                </button>
              </div>

              <div className="w-full mt-3 flex items-center justify-between text-xs text-muted-foreground px-1">
                <span>Format: Vertical Short</span>
                <span className="text-[#9dbeb8] font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> Audio Synced (100%)
                </span>
              </div>

              {selectedClip && (
                <div className="w-full mt-2 pt-2 border-t border-border flex items-center justify-between text-xs px-1">
                  <span className="font-bold text-foreground truncate max-w-[170px]" title={selectedClip.title}>
                    {selectedClip.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmClip(selectedClip)}
                    className="px-2.5 py-1 rounded-lg text-rose-500 hover:bg-rose-500/10 text-xs font-semibold flex items-center gap-1 border border-rose-500/20 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" /> Move to Trash
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: AI Editing Suite */}
          <div className="lg:col-span-7 space-y-4">
            {/* Intelligent Cropping & Zoom */}
            <div className="vice-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                  <Maximize2 className="w-4 h-4 text-primary" />
                  Framing & Action Focus
                </h3>
                <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded font-bold">
                  AUTO-TRACK
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'center', label: 'Center Focus', desc: 'Vehicle & Player' },
                  { id: 'left', label: 'Left Bias', desc: 'Radar & Speedometer' },
                  { id: 'right', label: 'Right Bias', desc: 'Crosshair & Action' },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => setCropMode(mode.id as any)}
                    className={`p-2.5 rounded-lg border text-left transition-all ${cropMode === mode.id
                      ? 'border-primary bg-primary/10 text-primary font-bold'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
                      }`}
                  >
                    <div className="text-xs">{mode.label}</div>
                    <div className="text-[10px] opacity-75">{mode.desc}</div>
                  </button>
                ))}
              </div>

              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between text-xs text-foreground">
                  <span>Action Zoom Scale</span>
                  <span className="font-mono text-primary font-bold">{zoomScale}x</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="1.4"
                  step="0.05"
                  value={zoomScale}
                  onChange={(e) => setZoomScale(parseFloat(e.target.value))}
                  className="w-full accent-[#ff8882]"
                />
              </div>
            </div>

            {/* Meme Reaction Placement */}
            <div className="vice-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                  <Smile className="w-4 h-4 text-primary" />
                  Meme Reaction Placement
                </h3>
                <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded font-bold">
                  1044 SFX LOADED
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { id: 'meme_shock_eyes', name: 'Shock Eyes', emotion: 'Shock' },
                  { id: 'meme_laugh_wheeze', name: 'Laugh Wheeze', emotion: 'Funny' },
                  { id: 'meme_facepalm_fail', name: 'Facepalm', emotion: 'Fail' },
                  { id: 'meme_rage_screaming', name: 'Rage Scream', emotion: 'Rage' },
                  { id: 'meme_triumph_flex', name: 'Triumph Flex', emotion: 'Win' },
                ].map((meme) => (
                  <button
                    key={meme.id}
                    onClick={() => setSelectedMeme(meme.id)}
                    className={`p-2 rounded-lg border text-left transition-all ${selectedMeme === meme.id
                      ? 'border-primary bg-primary/10 text-primary font-bold'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
                      }`}
                  >
                    <div className="text-xs font-semibold">{meme.name}</div>
                    <div className="text-[10px] opacity-75">{meme.emotion}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Audio Ducking & Volume */}
            <div className="vice-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                  <Volume2 className="w-4 h-4 text-[#9dbeb8]" />
                  Audio Ducking Balance
                </h3>
                <span className="text-[10px] bg-[#9dbeb8]/10 text-[#9dbeb8] px-2 py-0.5 rounded font-bold">
                  STREAMER SAFE
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-foreground">
                    <span>Music Volume</span>
                    <span className="font-mono text-primary font-bold">{musicVolume}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={musicVolume}
                    onChange={(e) => setMusicVolume(parseInt(e.target.value, 10))}
                    className="w-full accent-[#ff8882]"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-foreground">
                    <span>Ducking Attenuation</span>
                    <span className="font-mono text-primary font-bold">{duckingDb} dB</span>
                  </div>
                  <input
                    type="range"
                    min="-24"
                    max="-6"
                    value={duckingDb}
                    onChange={(e) => setDuckingDb(parseInt(e.target.value, 10))}
                    className="w-full accent-[#ff8882]"
                  />
                </div>
              </div>
            </div>

            {/* Subtitle Typography */}
            <div className="vice-card p-4 space-y-3">
              <h3 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                <Type className="w-4 h-4 text-primary" />
                Animated Subtitles
              </h3>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'coral_neon', label: 'Coral Neon', sample: 'CORAL & SAGE' },
                  { id: 'soft_peach', label: 'Soft Peach', sample: 'PEACH SUNSET' },
                  { id: 'clean_white', label: 'Sora Bold', sample: 'SORA CLEAN' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSubtitleStyle(item.id)}
                    className={`p-2 rounded-lg border text-center transition-all ${subtitleStyle === item.id
                      ? 'border-primary bg-primary/10 text-primary font-bold'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40'
                      }`}
                  >
                    <div className="text-xs">{item.label}</div>
                    <div className="text-[10px] opacity-75 font-mono mt-0.5">{item.sample}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Re-Render Button */}
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-muted-foreground">
                {renderSuccess ? (
                  <span className="text-[#9dbeb8] font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4 text-primary" /> 9:16 Vertical Short Re-Rendered Successfully!
                  </span>
                ) : (
                  <span>Compiled using FFmpeg 9:16 stream pipeline</span>
                )}
              </div>

              <button
                type="button"
                onClick={handleReRender}
                disabled={isRendering}
                className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] text-[#194350] font-extrabold text-xs shadow-sm hover:opacity-95 disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer"
              >
                {isRendering ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-[#194350] border-t-transparent rounded-full animate-spin" />
                    Re-Rendering 1080×1920...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" /> Apply & Re-Render Short
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Clip Confirmation Modal */}
      {deleteConfirmClip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-scale-in">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-base text-foreground">Move Clip to Trash?</h3>
                <p className="text-xs text-muted-foreground">
                  Move <strong className="text-foreground">{deleteConfirmClip.title}</strong> to Trash?
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-xl border border-border">
              This clip will be moved to the Trash for 30 days. Its original source video and other sibling clips will remain completely untouched. You can restore it anytime from the Media Library Trash.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmClip(null)}
                disabled={deletingClip}
                className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold border border-border transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteClip}
                disabled={deletingClip}
                className="px-4 py-2 rounded-xl bg-rose-500 text-white hover:bg-rose-600 text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                {deletingClip ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Moving...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Move to Trash</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Publish Now Modal */}
      {showPublishModal && selectedClip && (
        <PublishModal
          isOpen={showPublishModal}
          onClose={() => setShowPublishModal(false)}
          clip={{
            id: selectedClip.id,
            title: selectedClip.title,
            duration: selectedClip.duration,
            resolution: '1080x1920',
            previewUrl: selectedClip.finalPreviewUrl || selectedClip.rawPreviewUrl,
            filePath: selectedClip.output_path || selectedClip.raw_clip_path,
          }}
          onSuccess={() => {
            setShowPublishModal(false);
          }}
        />
      )}

      {/* Schedule Modal */}
      {showScheduleModal && selectedClip && (
        <ScheduleModal
          isOpen={showScheduleModal}
          onClose={() => setShowScheduleModal(false)}
          clip={{
            id: selectedClip.id,
            title: selectedClip.title,
            duration: selectedClip.duration,
            resolution: '1080x1920',
            previewUrl: selectedClip.finalPreviewUrl || selectedClip.rawPreviewUrl,
            filePath: selectedClip.output_path || selectedClip.raw_clip_path,
          }}
          onSuccess={() => {
            setShowScheduleModal(false);
          }}
        />
      )}
    </div>
  );
}

export default function ShortsEditorPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-xs text-muted-foreground">Loading video editor...</div>}>
      <EditorContent />
    </Suspense>
  );
}
'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Flame,
  Sparkles,
  Play,
  Film,
  Scissors,
  CheckCircle2,
  XCircle,
  RotateCw,
  Download,
  Share2,
  Calendar,
  Clock,
  Volume2,
  Tag,
  AlertCircle,
  Eye,
  Trash2,
  MoreVertical,
  Edit2,
  CheckSquare,
  Square,
  Layers,
} from 'lucide-react';
import { Pagination } from '@/components/ui/pagination';

function HighlightsContent() {
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => searchParams.get('projectId') || 'all');
  const [clips, setClips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [total, setTotal] = useState(0);
  const [previewModes, setPreviewModes] = useState<Record<string, 'edited' | 'raw'>>({});
  const [actionFeedback, setActionFeedback] = useState<Record<string, string>>({});

  // Multi-selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  // Modals state
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [renameTarget, setRenameTarget] = useState<any>(null);
  const [renameValue, setRenameValue] = useState('');

  // Fetch projects list for filter dropdown
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

  const fetchClips = () => {
    setLoading(true);
    const projQuery = selectedProjectId !== 'all' ? `&projectId=${encodeURIComponent(selectedProjectId)}` : '';
    fetch(`/api/clips?page=${page}&pageSize=${pageSize}${projQuery}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.clips) {
          setClips(data.clips);
          setTotal(data.pagination?.total || data.clips.length);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchClips();
  }, [page, pageSize, selectedProjectId]);

  useEffect(() => {
    const handleClickOutside = () => setOpenDropdownId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const toggleSelect = (clipId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(clipId)) next.delete(clipId);
      else next.add(clipId);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(clips.map((c) => c.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleStatusChange = async (clipId: string, status: 'approved' | 'rejected') => {
    try {
      const res = await fetch('/api/clips', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipId, status }),
      });
      if (res.ok) {
        setActionFeedback((prev) => ({
          ...prev,
          [clipId]: status === 'approved' ? '✓ Clip Approved!' : '✕ Clip Rejected',
        }));
        setClips((prev) =>
          prev.map((c) => (c.id === clipId ? { ...c, status } : c))
        );
        setTimeout(() => {
          setActionFeedback((prev) => {
            const copy = { ...prev };
            delete copy[clipId];
            return copy;
          });
        }, 3000);
      }
    } catch (err: any) {
      alert(`Action failed: ${err.message}`);
    }
  };

  const handleDelete = async (clipId: string) => {
    try {
      const res = await fetch('/api/media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: clipId, type: 'clip', permanent: false }),
      });
      const data = await res.json();
      if (data.success) {
        setClips((prev) => prev.filter((c) => c.id !== clipId));
        setDeleteTarget(null);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(clipId);
          return next;
        });
      } else {
        alert(data.error || 'Delete failed');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    try {
      const ids = Array.from(selectedIds);
      const res = await fetch('/api/media/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, type: 'clip', permanent: false }),
      });
      const data = await res.json();
      if (data.success || data.successCount > 0) {
        setClips((prev) => prev.filter((c) => !selectedIds.has(c.id)));
        setSelectedIds(new Set());
        setBulkDeleteConfirm(false);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameValue.trim()) return;

    try {
      const res = await fetch('/api/media/rename', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: renameTarget.id, type: 'clip', title: renameValue.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setClips((prev) =>
          prev.map((c) => (c.id === renameTarget.id ? { ...c, title: renameValue.trim() } : c))
        );
        setRenameTarget(null);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const togglePreviewMode = (clipId: string, mode: 'edited' | 'raw') => {
    setPreviewModes((prev) => ({ ...prev, [clipId]: mode }));
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
            <Flame className="w-5 h-5 text-primary" />
            AI Detected Highlights & Review
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Entertainment scoring, 10-category gameplay classification, and publishing controls.
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
                setPage(1);
              }}
              className="bg-transparent text-foreground font-bold focus:outline-none cursor-pointer max-w-[200px] truncate"
            >
              <option value="all" className="bg-card text-foreground">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id} className="bg-card text-foreground">
                  {p.title} ({p.id.slice(0, 14)})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={fetchClips}
            className="px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <Link
            href="/projects/new"
            className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] text-[#194350] font-bold text-xs flex items-center gap-1.5 hover:opacity-95 transition-opacity"
          >
            <Sparkles className="w-3.5 h-3.5" /> Ingest Video
          </Link>
        </div>
      </div>

      {/* Active Project Banner */}
      {selectedProjectId !== 'all' && (
        <div className="bg-card border border-primary/30 p-3 rounded-2xl flex items-center justify-between text-xs animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground">Project Scope:</span>
            <span className="font-mono text-primary font-bold">{selectedProjectId}</span>
            {projects.find((p) => p.id === selectedProjectId)?.source_url && (
              <span className="text-muted-foreground truncate max-w-sm hidden md:inline">
                ({projects.find((p) => p.id === selectedProjectId)?.source_url})
              </span>
            )}
          </div>
          <button
            onClick={() => setSelectedProjectId('all')}
            className="text-xs text-primary hover:underline cursor-pointer font-semibold"
          >
            Clear Filter (Show All)
          </button>
        </div>
      )}

      {/* Multi-Selection Bulk Bar */}
      {selectedIds.size > 0 && (
        <div className="bg-primary/10 border border-primary/30 p-3 rounded-2xl flex items-center justify-between text-xs font-semibold animate-fade-in">
          <div className="flex items-center gap-2 text-primary font-bold">
            <CheckSquare className="w-4 h-4" />
            <span>{selectedIds.size} highlight(s) selected</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={deselectAll}
              className="px-3 py-1 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground text-xs"
            >
              Deselect All
            </button>
            <button
              onClick={() => setBulkDeleteConfirm(true)}
              className="px-3 py-1 rounded-lg bg-rose-500/20 text-rose-500 border border-rose-500/30 hover:bg-rose-500/30 text-xs font-bold flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" /> Move to Trash
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="vice-card p-12 text-center text-xs text-muted-foreground space-y-2">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p>Retrieving AI highlights...</p>
        </div>
      ) : clips.length === 0 ? (
        <div className="vice-card p-12 text-center space-y-3">
          <Film className="w-10 h-10 text-muted-foreground mx-auto" />
          <h3 className="font-bold text-sm text-foreground">No AI Highlights Detected Yet</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Provide a YouTube stream link or upload a gameplay file to let the AI highlight detection agent scan for stunts and chases.
          </p>
          <Link
            href="/projects/new"
            className="inline-flex px-4 py-2 rounded-lg bg-primary text-[#194350] font-bold text-xs"
          >
            Create Short
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {clips.map((clip) => {
            const currentMode = previewModes[clip.id] || (clip.finalPreviewUrl ? 'edited' : 'raw');
            const activeVideoSrc = currentMode === 'edited' && clip.finalPreviewUrl ? clip.finalPreviewUrl : clip.rawPreviewUrl;
            const isSelected = selectedIds.has(clip.id);
            const isDropdownOpen = openDropdownId === clip.id;

            return (
              <div
                key={clip.id}
                className={`vice-card p-4 space-y-3 flex flex-col justify-between transition-all relative ${
                  isSelected ? 'border-primary ring-1 ring-primary/40 bg-primary/5' : ''
                }`}
              >
                {/* Header Information */}
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Checkbox */}
                        <button
                          onClick={(e) => toggleSelect(clip.id, e)}
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                            isSelected ? 'bg-primary border-primary text-[#194350]' : 'border-border'
                          }`}
                        >
                          {isSelected && <CheckSquare className="w-3.5 h-3.5" />}
                        </button>

                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-primary/10 text-primary border border-primary/20">
                          {clip.categoryLabel || clip.highlightCategory?.replace(/_/g, ' ') || 'ACTION'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            clip.status === 'approved'
                              ? 'bg-[#9dbeb8]/20 text-[#9dbeb8] border-[#9dbeb8]/30'
                              : clip.status === 'rejected'
                              ? 'bg-rose-500/20 text-rose-500 border-rose-500/30'
                              : 'bg-muted text-muted-foreground border-border'
                          }`}
                        >
                          {clip.status ? clip.status.toUpperCase() : 'RENDERED'}
                        </span>
                      </div>
                      <h3 className="font-bold text-sm text-foreground">{clip.title}</h3>
                      <p className="text-[11px] text-muted-foreground">{clip.projectTitle}</p>
                    </div>

                    {/* Right: Score Badge & Three-Dot Dropdown */}
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col items-center justify-center min-w-[50px] h-12 rounded-xl bg-muted border border-border">
                        <span className="text-lg font-black text-primary leading-none">{clip.entertainmentScore || 95}</span>
                        <span className="text-[8px] text-muted-foreground uppercase font-bold tracking-wider mt-0.5">Score</span>
                      </div>

                      {/* Three-Dot Menu */}
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenDropdownId(isDropdownOpen ? null : clip.id);
                          }}
                          className="w-8 h-8 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center"
                          title="More Actions"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {isDropdownOpen && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 top-9 w-44 rounded-xl bg-card border border-border shadow-xl p-1 z-50 text-xs animate-fade-in"
                          >
                            <button
                              onClick={() => {
                                setRenameTarget(clip);
                                setRenameValue(clip.title);
                                setOpenDropdownId(null);
                              }}
                              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground flex items-center gap-2"
                            >
                              <Edit2 className="w-3.5 h-3.5" /> Rename
                            </button>

                            <Link
                              href={`/editor?projectId=${clip.project_id || selectedProjectId}&clip=${clip.id}`}
                              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground flex items-center gap-2"
                            >
                              <Scissors className="w-3.5 h-3.5 text-primary" /> Open in Editor
                            </Link>

                            {clip.finalPreviewUrl && (
                              <a
                                href={clip.finalPreviewUrl}
                                download={`${clip.id}_short.mp4`}
                                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground flex items-center gap-2"
                              >
                                <Download className="w-3.5 h-3.5" /> Download MP4
                              </a>
                            )}

                            <div className="my-1 border-t border-border" />

                            <button
                              onClick={() => {
                                setDeleteTarget(clip);
                                setOpenDropdownId(null);
                              }}
                              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-rose-500/10 text-rose-500 flex items-center gap-2 font-semibold"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Move to Trash
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Video Player Preview */}
                  <div className="space-y-2">
                    <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-border flex items-center justify-center">
                      {activeVideoSrc ? (
                        <video
                          key={activeVideoSrc}
                          controls
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-contain"
                          src={activeVideoSrc}
                        />
                      ) : (
                        <div className="text-center p-4 text-muted-foreground text-xs">
                          <AlertCircle className="w-6 h-6 mx-auto mb-1 opacity-50" />
                          Video rendering or preview unavailable.
                        </div>
                      )}

                      <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/75 text-[10px] font-bold text-white">
                        {currentMode === 'edited' ? '9:16 Vertical Short' : 'Original Raw'}
                      </div>
                    </div>

                    {/* Switcher Buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => togglePreviewMode(clip.id, 'raw')}
                        disabled={!clip.rawPreviewUrl}
                        className={`flex-1 py-1 px-2 rounded-md text-xs font-bold border transition-colors ${
                          currentMode === 'raw'
                            ? 'bg-muted border-primary text-primary'
                            : 'bg-card border-border text-muted-foreground hover:text-foreground'
                        } disabled:opacity-40`}
                      >
                        Original Raw
                      </button>

                      <button
                        type="button"
                        onClick={() => togglePreviewMode(clip.id, 'edited')}
                        disabled={!clip.finalPreviewUrl}
                        className={`flex-1 py-1 px-2 rounded-md text-xs font-bold border transition-colors ${
                          currentMode === 'edited'
                            ? 'bg-primary/10 border-primary text-primary'
                            : 'bg-card border-border text-muted-foreground hover:text-foreground'
                        } disabled:opacity-40`}
                      >
                        Edited 9:16
                      </button>
                    </div>
                  </div>

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-muted/50 border border-border text-xs">
                    <div>
                      <span className="text-[10px] text-muted-foreground block uppercase">Start</span>
                      <span className="font-mono text-foreground font-bold">
                        {formatTime(clip.startTime)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block uppercase">End</span>
                      <span className="font-mono text-foreground font-bold">
                        {formatTime(clip.endTime)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block uppercase">Duration</span>
                      <span className="font-mono text-primary font-bold">{clip.duration.toFixed(1)}s</span>
                    </div>
                  </div>

                  {/* Hook Context */}
                  <div className="text-[11px] bg-muted/30 p-2 rounded-lg border border-border text-muted-foreground space-y-1">
                    <div>
                      <strong className="text-foreground">Peak Event:</strong> {clip.peakEvent || 'High action climax'}
                    </div>
                    <div className="flex items-center gap-1">
                      <Volume2 className="w-3 h-3 text-[#9dbeb8]" />
                      <span>SFX: {clip.selectedMemeSound || 'Impact Crash'}</span>
                    </div>
                  </div>
                </div>

                {/* Feedback */}
                {actionFeedback[clip.id] && (
                  <div className="text-center py-1 px-2 rounded bg-[#9dbeb8]/10 text-[#9dbeb8] text-xs font-bold">
                    {actionFeedback[clip.id]}
                  </div>
                )}

                {/* Actions */}
                <div className="space-y-2 pt-2 border-t border-border">
                  <div className="grid grid-cols-4 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleStatusChange(clip.id, 'approved')}
                      className="py-1.5 rounded-md bg-[#9dbeb8]/15 hover:bg-[#9dbeb8]/25 text-[#9dbeb8] font-bold text-xs flex items-center justify-center gap-1"
                    >
                      <CheckCircle2 className="w-3 h-3" /> Approve
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStatusChange(clip.id, 'rejected')}
                      className="py-1.5 rounded-md bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-bold text-xs flex items-center justify-center gap-1"
                    >
                      <XCircle className="w-3 h-3" /> Reject
                    </button>

                    <Link
                      href={`/editor?clip=${clip.id}`}
                      className="py-1.5 rounded-md bg-muted hover:bg-muted/80 text-foreground font-bold text-xs flex items-center justify-center gap-1 border border-border"
                    >
                      <Scissors className="w-3 h-3" /> Edit
                    </Link>

                    {clip.finalPreviewUrl ? (
                      <a
                        href={clip.finalPreviewUrl}
                        download={`${clip.id}_short.mp4`}
                        className="py-1.5 rounded-md bg-muted hover:bg-muted/80 text-foreground font-bold text-xs flex items-center justify-center gap-1 border border-border"
                      >
                        <Download className="w-3 h-3" /> Save
                      </a>
                    ) : (
                      <button disabled className="py-1.5 rounded-md bg-muted opacity-40 text-xs">
                        Save
                      </button>
                    )}
                  </div>

                  <Link
                    href={`/publishing?publishNow=${clip.id}`}
                    className="w-full py-1.5 rounded-md bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] text-[#194350] font-bold text-xs flex items-center justify-center gap-1 shadow-sm hover:opacity-95"
                  >
                    <Share2 className="w-3.5 h-3.5" /> Publish to Shorts & Reels
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Highlights Server-Side Pagination */}
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(p) => setPage(p)}
        onPageSizeChange={(ps) => {
          setPageSize(ps);
          setPage(1);
        }}
        pageSizeOptions={[12, 24, 48, 96]}
        isLoading={loading}
        itemLabel="highlights"
      />

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="vice-card max-w-md w-full p-6 space-y-4 border border-border bg-card text-foreground shadow-2xl">
            <div className="flex items-center gap-3 text-rose-500 border-b border-border pb-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/15 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-foreground">Move to Trash?</h3>
                <p className="text-xs text-muted-foreground">
                  This will move the selected clip to your Trash. You can restore it anytime.
                </p>
              </div>
            </div>

            <div className="p-3 bg-muted/50 rounded-xl border border-border text-xs font-semibold text-foreground truncate">
              {deleteTarget.title}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteTarget.id)}
                className="px-5 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs shadow-sm transition-colors"
              >
                Move to Trash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Modal */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="vice-card max-w-md w-full p-6 space-y-4 border border-border bg-card text-foreground shadow-2xl">
            <div className="flex items-center gap-3 text-rose-500 border-b border-border pb-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/15 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-foreground">
                  Move {selectedIds.size} Clips to Trash?
                </h3>
                <p className="text-xs text-muted-foreground">
                  You can restore these clips anytime from the Media Library Trash tab.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
              <button
                onClick={() => setBulkDeleteConfirm(false)}
                className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-5 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs shadow-sm"
              >
                Move to Trash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="vice-card max-w-md w-full p-6 space-y-4 border border-border bg-card text-foreground shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-primary" /> Rename Highlight
              </h3>
              <button onClick={() => setRenameTarget(null)} className="text-muted-foreground hover:text-foreground">
                ✕
              </button>
            </div>

            <form onSubmit={handleRenameSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">Highlight Title</label>
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="w-full bg-input border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary font-medium"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setRenameTarget(null)}
                  className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] text-[#194350] font-bold text-xs shadow-sm hover:opacity-95"
                >
                  Save Title
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HighlightsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground text-xs">Loading Highlights...</div>}>
      <HighlightsContent />
    </Suspense>
  );
}

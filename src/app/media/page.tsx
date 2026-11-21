'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Film,
  Video,
  Scissors,
  CheckCircle2,
  Trash2,
  RotateCcw,
  Search,
  Filter,
  Grid,
  List,
  MoreVertical,
  Download,
  Edit2,
  Copy,
  Play,
  HardDrive,
  Eye,
  AlertTriangle,
  RefreshCw,
  Plus,
  CheckSquare,
  Square,
  Share2,
  Clock,
  Sparkles,
  ExternalLink,
  Youtube,
  Calendar,
} from 'lucide-react';
import { PublishModal } from '@/components/publishing/publish-modal';
import { ScheduleModal } from '@/components/publishing/schedule-modal';
import type { MediaTab, UnifiedMediaItem, StorageBreakdown } from '@/lib/media-manager';

export default function MediaLibraryPage() {
  const [activeTab, setActiveTab] = useState<MediaTab>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [durationFilter, setDurationFilter] = useState('all');

  const [items, setItems] = useState<UnifiedMediaItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [storageStats, setStorageStats] = useState<StorageBreakdown | null>(null);
  const [loading, setLoading] = useState(true);

  // Multi-selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modals state
  const [previewItem, setPreviewItem] = useState<UnifiedMediaItem | null>(null);
  const [mediaPublishClip, setMediaPublishClip] = useState<any | null>(null);
  const [mediaScheduleClip, setMediaScheduleClip] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UnifiedMediaItem | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [renameTarget, setRenameTarget] = useState<UnifiedMediaItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [sourceDeleteOptions, setSourceDeleteOptions] = useState<{ deleteClips: boolean }>({ deleteClips: false });

  // Open dropdown ID
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const loadMedia = async () => {
    try {
      const params = new URLSearchParams({
        tab: activeTab,
        search,
        sort,
      });
      if (platformFilter !== 'all') params.set('platform', platformFilter);
      if (durationFilter === 'short') {
        params.set('maxDuration', '30');
      } else if (durationFilter === 'medium') {
        params.set('minDuration', '30');
        params.set('maxDuration', '60');
      } else if (durationFilter === 'long') {
        params.set('minDuration', '60');
        params.set('maxDuration', '120');
      } else if (durationFilter === 'very_long') {
        params.set('minDuration', '120');
      }

      const res = await fetch(`/api/media?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.items || []);
        setCounts(data.counts || {});
        setStorageStats(data.storageStats || null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMedia();
  }, [activeTab, search, sort, platformFilter, durationFilter]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleWindowClick = () => setOpenDropdownId(null);
    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, []);

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(items.map((i) => i.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const showFeedback = (type: 'success' | 'error' | 'info', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  // Delete Action Handlers
  const handleSingleDelete = async (permanent: boolean) => {
    if (!deleteTarget) return;

    try {
      const res = await fetch('/api/media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: deleteTarget.id,
          type: deleteTarget.type === 'source' ? 'source' : 'clip',
          permanent,
          deleteClips: sourceDeleteOptions.deleteClips,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showFeedback(
          'success',
          permanent
            ? `✓ Permanently purged "${deleteTarget.title}"`
            : `✓ Moved "${deleteTarget.title}" to Trash`
        );
        setDeleteTarget(null);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(deleteTarget.id);
          return next;
        });
        loadMedia();
      } else {
        showFeedback('error', data.error || 'Delete failed');
      }
    } catch (err: any) {
      showFeedback('error', err.message);
    }
  };

  const handleBulkDelete = async (permanent: boolean) => {
    if (selectedIds.size === 0) return;

    try {
      const ids = Array.from(selectedIds);
      const res = await fetch('/api/media/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, permanent }),
      });
      const data = await res.json();
      if (data.success || data.successCount > 0) {
        showFeedback(
          'success',
          permanent
            ? `✓ Permanently deleted ${data.successCount} items`
            : `✓ Moved ${data.successCount} items to Trash`
        );
        setSelectedIds(new Set());
        setBulkDeleteConfirm(false);
        loadMedia();
      } else {
        showFeedback('error', 'Bulk delete failed');
      }
    } catch (err: any) {
      showFeedback('error', err.message);
    }
  };

  const handleRestore = async (id: string) => {
    try {
      const res = await fetch('/api/media/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.success) {
        showFeedback('success', '✓ Item restored from Trash');
        loadMedia();
      } else {
        showFeedback('error', data.error || 'Restore failed');
      }
    } catch (err: any) {
      showFeedback('error', err.message);
    }
  };

  const handleBulkRestore = async () => {
    if (selectedIds.size === 0) return;
    try {
      const ids = Array.from(selectedIds);
      const res = await fetch('/api/media/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (data.success) {
        showFeedback('success', `✓ Restored ${data.successCount} items from Trash`);
        setSelectedIds(new Set());
        loadMedia();
      }
    } catch (err: any) {
      showFeedback('error', err.message);
    }
  };

  const handleEmptyTrash = async () => {
    if (!confirm('Are you sure you want to permanently empty the Trash? All files will be unlinked.')) return;
    try {
      const res = await fetch('/api/media/empty-trash', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showFeedback('success', `✓ Trash emptied. ${data.purgedCount} items purged permanently.`);
        loadMedia();
      }
    } catch (err: any) {
      showFeedback('error', err.message);
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameValue.trim()) return;

    try {
      const res = await fetch('/api/media/rename', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: renameTarget.id,
          type: renameTarget.type === 'source' ? 'source' : 'clip',
          title: renameValue.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        showFeedback('success', '✓ Item renamed successfully');
        setRenameTarget(null);
        loadMedia();
      } else {
        showFeedback('error', data.error || 'Rename failed');
      }
    } catch (err: any) {
      showFeedback('error', err.message);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb < 1000) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  const formatDuration = (sec: number) => {
    if (!sec) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const isTrashTab = activeTab === 'trash';

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-semibold mb-2">
            <Film className="w-3.5 h-3.5" />
            Unified Media Management & Storage Hub
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground">
            Media <span className="vice-gradient-text">Library</span>
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">
            Manage, preview, rename, and safely delete original gameplay recordings, extracted clips, and vertical Shorts.
          </p>
        </div>

        {/* Storage stats overview */}
        {storageStats && (
          <div className="flex items-center gap-3 bg-muted/60 border border-border px-4 py-2.5 rounded-2xl self-start sm:self-auto text-xs">
            <HardDrive className="w-4 h-4 text-primary" />
            <div>
              <div className="font-bold text-foreground">
                {storageStats.totalGigabytes} GB <span className="font-normal text-muted-foreground">Used</span>
              </div>
              <div className="text-[10px] text-muted-foreground">
                {storageStats.totalFiles} Videos • {formatBytes(storageStats.sourcesBytes)} Sources
              </div>
            </div>
          </div>
        )}
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between animate-fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
              : feedback.type === 'info'
              ? 'bg-sky-500/10 border-sky-500/30 text-sky-700 dark:text-sky-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
          }`}
        >
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="text-xs hover:underline ml-3">
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-3 overflow-x-auto text-xs font-bold scrollbar-none">
        {[
          { key: 'all', label: 'All Media', count: counts.all },
          { key: 'sources', label: 'Source Videos', count: counts.sources },
          { key: 'extracted', label: 'Extracted Clips', count: counts.extracted },
          { key: 'edited', label: 'Edited Videos', count: counts.edited },
          { key: 'ready', label: 'Ready to Publish', count: counts.ready },
          { key: 'published', label: 'Published', count: counts.published },
          { key: 'trash', label: 'Trash', count: counts.trash, isTrash: true },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key as MediaTab);
              setSelectedIds(new Set());
            }}
            className={`px-4 py-2 rounded-xl whitespace-nowrap transition-all flex items-center gap-1.5 ${
              activeTab === tab.key
                ? tab.isTrash
                  ? 'bg-rose-500/20 text-rose-500 border border-rose-500/30 shadow-xs font-bold'
                  : 'bg-primary text-[#194350] shadow-xs font-bold'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  activeTab === tab.key
                    ? 'bg-black/20 text-current font-black'
                    : 'bg-muted text-muted-foreground font-mono'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Toolbar: Search, Filters, Bulk Selection, View Toggle */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-muted/30 border border-border p-3.5 rounded-2xl">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by title, category, or project..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-card border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
        </div>

        {/* Filters and View Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="bg-card border border-border rounded-xl px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary font-medium"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="title_asc">Title (A-Z)</option>
            <option value="duration_desc">Longest Duration</option>
            <option value="duration_asc">Shortest Duration</option>
            <option value="size_desc">Largest Size</option>
          </select>

          <select
            value={durationFilter}
            onChange={(e) => setDurationFilter(e.target.value)}
            className="bg-card border border-border rounded-xl px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary font-medium"
          >
            <option value="all">All Durations</option>
            <option value="short">&lt; 30s</option>
            <option value="medium">30s – 60s</option>
            <option value="long">60s – 120s (Recommended)</option>
            <option value="very_long">&gt; 120s</option>
          </select>

          {/* View mode buttons */}
          <div className="flex items-center border border-border rounded-xl p-0.5 bg-card">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === 'grid' ? 'bg-primary text-[#194350]' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Grid View"
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === 'list' ? 'bg-primary text-[#194350]' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="List View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Multi-Selection Bar */}
      {selectedIds.size > 0 && (
        <div className="bg-primary/10 border border-primary/30 p-3 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in text-xs font-semibold">
          <div className="flex items-center gap-2 text-primary font-bold">
            <CheckSquare className="w-4 h-4" />
            <span>{selectedIds.size} item(s) selected</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={deselectAll}
              className="px-3 py-1 rounded-lg bg-card border border-border hover:bg-muted text-muted-foreground hover:text-foreground text-xs"
            >
              Deselect All
            </button>

            {isTrashTab ? (
              <>
                <button
                  onClick={handleBulkRestore}
                  className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 text-xs flex items-center gap-1 font-bold"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Restore Selected
                </button>
                <button
                  onClick={() => setBulkDeleteConfirm(true)}
                  className="px-3 py-1 rounded-lg bg-rose-500/20 text-rose-500 border border-rose-500/30 hover:bg-rose-500/30 text-xs flex items-center gap-1 font-bold"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Permanently
                </button>
              </>
            ) : (
              <button
                onClick={() => setBulkDeleteConfirm(true)}
                className="px-3 py-1 rounded-lg bg-rose-500/20 text-rose-500 border border-rose-500/30 hover:bg-rose-500/30 text-xs flex items-center gap-1 font-bold"
              >
                <Trash2 className="w-3.5 h-3.5" /> Move Selected to Trash
              </button>
            )}
          </div>
        </div>
      )}

      {/* Trash Tab Banner with Empty Trash action */}
      {isTrashTab && (
        <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-0.5">
            <h4 className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <Trash2 className="w-4 h-4" /> Trash & Retention Policy
            </h4>
            <p className="text-muted-foreground text-[11px]">
              Deleted videos are retained here so you never lose viral moments by accident. You can restore them anytime or permanently empty the Trash.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleEmptyTrash}
              className="px-3.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-500 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Empty Trash
            </button>
          </div>
        </div>
      )}

      {/* Media Items Presentation */}
      {loading ? (
        <div className="vice-card p-16 text-center text-xs text-muted-foreground space-y-2">
          <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p>Loading media library...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="vice-card p-16 text-center space-y-3">
          <Film className="w-10 h-10 text-muted-foreground mx-auto opacity-50" />
          <h3 className="font-bold text-sm text-foreground">
            {isTrashTab ? 'Trash is Empty' : 'No Media Found'}
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {isTrashTab
              ? 'No items currently in Trash.'
              : 'No videos match the selected filters. Ingest a YouTube stream or create a Short to populate your library.'}
          </p>
          {!isTrashTab && (
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-[#194350] font-bold text-xs"
            >
              <Plus className="w-3.5 h-3.5" /> Ingest New Video
            </Link>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {items.map((item) => {
            const isSelected = selectedIds.has(item.id);
            const isDropdownOpen = openDropdownId === item.id;

            return (
              <div
                key={item.id}
                className={`vice-card p-3 space-y-2.5 flex flex-col justify-between border transition-all relative group ${
                  isSelected ? 'border-primary ring-1 ring-primary/40 bg-primary/5' : 'border-border'
                }`}
              >
                {/* Card Top: Checkbox & Three-Dot Menu */}
                <div className="space-y-2">
                  <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-border group-hover:shadow-md transition-shadow">
                    {/* Video / Preview */}
                    {item.previewUrl ? (
                      <video
                        src={item.previewUrl}
                        preload="metadata"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-muted/40 text-muted-foreground text-xs">
                        <Video className="w-8 h-8 opacity-40" />
                      </div>
                    )}

                    {/* Top overlay: Checkbox & Type Badge */}
                    <div className="absolute top-2 left-2 flex items-center gap-1.5 z-10">
                      <button
                        onClick={(e) => toggleSelect(item.id, e)}
                        className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                          isSelected
                            ? 'bg-primary border-primary text-[#194350]'
                            : 'bg-black/60 border-white/40 text-transparent hover:border-white'
                        }`}
                      >
                        <CheckSquare className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Top right: Three-Dot Action Menu Button */}
                    <div className="absolute top-2 right-2 z-10">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenDropdownId(isDropdownOpen ? null : item.id);
                        }}
                        className="w-7 h-7 rounded-lg bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-xs border border-white/20 transition-colors"
                        title="Action Menu"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>

                      {/* Dropdown Menu */}
                      {isDropdownOpen && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 top-8 w-44 rounded-xl bg-card border border-border shadow-xl p-1 z-50 text-xs animate-fade-in"
                        >
                          <button
                            onClick={() => {
                              setPreviewItem(item);
                              setOpenDropdownId(null);
                            }}
                            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground flex items-center gap-2"
                          >
                            <Eye className="w-3.5 h-3.5 text-primary" /> Preview Video
                          </button>

                          <button
                            onClick={() => {
                              setRenameTarget(item);
                              setRenameValue(item.title);
                              setOpenDropdownId(null);
                            }}
                            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground flex items-center gap-2"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> Rename
                          </button>

                          {item.previewUrl && (
                            <a
                              href={item.previewUrl}
                              download
                              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground flex items-center gap-2"
                            >
                              <Download className="w-3.5 h-3.5" /> Download MP4
                            </a>
                          )}

                          {item.type === 'clip' && (
                            <Link
                              href="/editor"
                              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground flex items-center gap-2"
                            >
                              <Scissors className="w-3.5 h-3.5 text-primary" /> Open in Editor
                            </Link>
                          )}

                          <div className="my-1 border-t border-border" />

                          {isTrashTab ? (
                            <>
                              <button
                                onClick={() => {
                                  handleRestore(item.id);
                                  setOpenDropdownId(null);
                                }}
                                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-2 font-semibold"
                              >
                                <RotateCcw className="w-3.5 h-3.5" /> Restore
                              </button>
                              <button
                                onClick={() => {
                                  setDeleteTarget(item);
                                  setOpenDropdownId(null);
                                }}
                                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-rose-500/10 text-rose-500 flex items-center gap-2 font-semibold"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Delete Permanently
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => {
                                setDeleteTarget(item);
                                setOpenDropdownId(null);
                              }}
                              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-rose-500/10 text-rose-500 flex items-center gap-2 font-semibold"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Move to Trash
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Bottom overlay: Duration & Resolution */}
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] text-white font-mono z-10 pointer-events-none">
                      <span className="bg-black/75 px-1.5 py-0.5 rounded font-bold">
                        {formatDuration(item.duration)}
                      </span>
                      <span className="bg-black/75 px-1.5 py-0.5 rounded font-semibold">
                        {item.resolution}
                      </span>
                    </div>

                    {/* Hover Quick Preview Button */}
                    <button
                      onClick={() => setPreviewItem(item)}
                      className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white"
                    >
                      <div className="w-10 h-10 rounded-full bg-primary/90 text-[#194350] flex items-center justify-center shadow-lg">
                        <Play className="w-5 h-5 ml-0.5 fill-current" />
                      </div>
                    </button>
                  </div>

                  {/* Title and metadata */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border ${
                          item.type === 'source'
                            ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30'
                            : item.type === 'export'
                            ? 'bg-primary/10 text-primary border-primary/30'
                            : item.status === 'rendered'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                            : 'bg-muted text-muted-foreground border-border'
                        }`}
                      >
                        {item.type === 'source' ? 'SOURCE' : item.type === 'export' ? 'EXPORT' : item.status.toUpperCase()}
                      </span>

                      {item.platform && (
                        <span className="text-[9px] text-muted-foreground font-mono uppercase">
                          {item.platform.replace('_', ' ')}
                        </span>
                      )}
                    </div>

                    <h4 className="font-bold text-xs text-foreground line-clamp-1" title={item.title}>
                      {item.title}
                    </h4>

                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{formatBytes(item.fileSize)}</span>
                      <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                    </div>

                    {item.type === 'source' && item.dependentClipsCount !== undefined && (
                      <p className="text-[10px] text-primary font-medium">
                        {item.dependentClipsCount} generated clip(s)
                      </p>
                    )}
                  </div>
                </div>

                {/* Card Bottom: Quick Actions */}
                <div className="space-y-1.5 pt-2 border-t border-border">
                  {/* Row 1: Prominent Publishing Actions for Clips and Exports */}
                  {(item.type === 'clip' || item.type === 'export' || item.status === 'rendered') && !isTrashTab && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setMediaPublishClip({
                          id: item.id,
                          title: item.title,
                          duration: item.duration,
                          resolution: item.resolution,
                          previewUrl: item.previewUrl,
                          filePath: item.filePath,
                        })}
                        className="flex-1 py-1.5 px-2 rounded-lg bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] text-[#194350] font-extrabold text-[11px] flex items-center justify-center gap-1 shadow-xs hover:opacity-95 transition-all"
                      >
                        <Youtube className="w-3.5 h-3.5" /> Publish Now
                      </button>

                      <button
                        type="button"
                        onClick={() => setMediaScheduleClip({
                          id: item.id,
                          title: item.title,
                          duration: item.duration,
                          resolution: item.resolution,
                          previewUrl: item.previewUrl,
                          filePath: item.filePath,
                        })}
                        className="py-1.5 px-2.5 rounded-lg border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary font-bold text-[11px] flex items-center justify-center gap-1 transition-colors"
                      >
                        <Calendar className="w-3.5 h-3.5" /> Schedule
                      </button>
                    </div>
                  )}

                  {/* Row 2: Secondary Utility Buttons */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setPreviewItem(item)}
                      className="flex-1 py-1 px-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-[11px] font-semibold flex items-center justify-center gap-1"
                    >
                      <Eye className="w-3 h-3 text-primary" /> Preview
                    </button>

                    {item.previewUrl && (
                      <a
                        href={item.previewUrl}
                        download={`${item.id}.mp4`}
                        className="p-1 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground text-[11px]"
                        title="Download MP4"
                      >
                        <Download className="w-3 h-3" />
                      </a>
                    )}

                    {item.type === 'clip' && (
                      <Link
                        href={`/editor?clip=${item.id}`}
                        className="p-1 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-primary text-[11px]"
                        title="Edit in Video Editor"
                      >
                        <Scissors className="w-3 h-3" />
                      </Link>
                    )}

                    {isTrashTab ? (
                      <button
                        onClick={() => handleRestore(item.id)}
                        className="py-1 px-2 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 text-[11px] font-bold"
                        title="Restore"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    ) : (
                      <button
                        onClick={() => setDeleteTarget(item)}
                        className="py-1 px-2 rounded-lg hover:bg-rose-500/15 text-muted-foreground hover:text-rose-500 text-[11px]"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="vice-card overflow-hidden border border-border">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 border-b border-border text-[11px] font-bold text-muted-foreground uppercase">
                <tr>
                  <th className="p-3 w-8">
                    <button
                      onClick={selectedIds.size === items.length ? deselectAll : selectAll}
                      className="w-4 h-4 rounded border flex items-center justify-center"
                    >
                      {selectedIds.size === items.length ? <CheckSquare className="w-3 h-3 text-primary" /> : null}
                    </button>
                  </th>
                  <th className="p-3">Video Title</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Duration</th>
                  <th className="p-3">Resolution</th>
                  <th className="p-3">File Size</th>
                  <th className="p-3">Created</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-medium">
                {items.map((item) => {
                  const isSelected = selectedIds.has(item.id);

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-muted/40 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}
                    >
                      <td className="p-3">
                        <button
                          onClick={(e) => toggleSelect(item.id, e)}
                          className={`w-4 h-4 rounded border flex items-center justify-center ${
                            isSelected ? 'bg-primary border-primary text-[#194350]' : 'border-border'
                          }`}
                        >
                          {isSelected && <CheckSquare className="w-3 h-3" />}
                        </button>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2.5">
                          <button
                            onClick={() => setPreviewItem(item)}
                            className="w-12 h-8 rounded-lg bg-black overflow-hidden shrink-0 border border-border flex items-center justify-center hover:opacity-80 transition-opacity"
                          >
                            <Play className="w-3.5 h-3.5 text-white" />
                          </button>
                          <div className="min-w-0">
                            <h4 className="font-bold text-foreground truncate max-w-xs sm:max-w-md">{item.title}</h4>
                            <p className="text-[10px] text-muted-foreground font-mono">{item.projectTitle}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-muted border border-border">
                          {item.type}
                        </span>
                      </td>
                      <td className="p-3 font-mono">{formatDuration(item.duration)}</td>
                      <td className="p-3 font-mono text-muted-foreground">{item.resolution}</td>
                      <td className="p-3 font-mono">{formatBytes(item.fileSize)}</td>
                      <td className="p-3 text-muted-foreground text-[11px]">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setPreviewItem(item)}
                            className="p-1.5 rounded-lg hover:bg-muted text-foreground"
                            title="Preview"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {isTrashTab ? (
                            <>
                              <button
                                onClick={() => handleRestore(item.id)}
                                className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                title="Restore"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeleteTarget(item)}
                                className="p-1.5 rounded-lg hover:bg-rose-500/10 text-rose-500"
                                title="Delete Permanently"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setDeleteTarget(item)}
                              className="p-1.5 rounded-lg hover:bg-rose-500/10 text-rose-500"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODALS
          ========================================================================= */}

      {/* 1. Preview Modal */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
          <div className="vice-card max-w-2xl w-full p-6 space-y-4 border border-border bg-card text-foreground shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-sm text-foreground truncate max-w-md">{previewItem.title}</h3>
              <button
                onClick={() => setPreviewItem(null)}
                className="w-7 h-7 rounded-lg hover:bg-muted text-muted-foreground flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="aspect-[9/16] max-h-[60vh] bg-black rounded-xl overflow-hidden border border-border mx-auto flex items-center justify-center">
              {previewItem.previewUrl ? (
                <video
                  src={previewItem.previewUrl}
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                />
              ) : (
                <p className="text-xs text-muted-foreground">Video preview not available</p>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-muted/40 p-3 rounded-xl border border-border">
              <div>
                <span className="text-[10px] text-muted-foreground block uppercase">Duration</span>
                <span className="font-bold font-mono">{formatDuration(previewItem.duration)}</span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block uppercase">Resolution</span>
                <span className="font-bold font-mono">{previewItem.resolution}</span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block uppercase">Size</span>
                <span className="font-bold font-mono">{formatBytes(previewItem.fileSize)}</span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block uppercase">Type</span>
                <span className="font-bold uppercase text-primary">{previewItem.type}</span>
              </div>
            </div>

            {/* Prominent Publishing Action Buttons */}
            <div className="pt-2 border-t border-border space-y-2">
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    const target = previewItem;
                    setPreviewItem(null);
                    setMediaPublishClip({
                      id: target.id,
                      title: target.title,
                      duration: target.duration,
                      resolution: target.resolution,
                      previewUrl: target.previewUrl,
                      filePath: target.filePath,
                    });
                  }}
                  className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] text-[#194350] font-extrabold text-xs flex items-center justify-center gap-2 shadow-md hover:opacity-95"
                >
                  <Youtube className="w-4 h-4" /> PUBLISH NOW
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const target = previewItem;
                    setPreviewItem(null);
                    setMediaScheduleClip({
                      id: target.id,
                      title: target.title,
                      duration: target.duration,
                      resolution: target.resolution,
                      previewUrl: target.previewUrl,
                      filePath: target.filePath,
                    });
                  }}
                  className="py-2.5 px-4 rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary font-extrabold text-xs flex items-center justify-center gap-2"
                >
                  <Calendar className="w-4 h-4" /> SCHEDULE
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                {previewItem.previewUrl && (
                  <a
                    href={previewItem.previewUrl}
                    download
                    className="px-4 py-1.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-semibold flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> Download MP4
                  </a>
                )}
                <button
                  onClick={() => setPreviewItem(null)}
                  className="px-4 py-1.5 rounded-xl border border-border bg-card hover:bg-muted text-foreground font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Single Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="vice-card max-w-md w-full p-6 space-y-4 border border-border bg-card text-foreground shadow-2xl">
            <div className="flex items-center gap-3 text-rose-500 border-b border-border pb-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/15 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-foreground">
                  {isTrashTab ? 'Delete Permanently?' : 'Move to Trash?'}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {isTrashTab
                    ? 'This will permanently remove the file from storage.'
                    : 'This will move the selected video to your Trash.'}
                </p>
              </div>
            </div>

            <div className="p-3 bg-muted/50 rounded-xl border border-border text-xs space-y-1">
              <div className="font-bold text-foreground truncate">{deleteTarget.title}</div>
              <div className="text-[11px] text-muted-foreground font-mono">
                Type: {deleteTarget.type} • {formatDuration(deleteTarget.duration)} • {formatBytes(deleteTarget.fileSize)}
              </div>
            </div>

            {/* Special handling for source video deletion */}
            {deleteTarget.type === 'source' && (
              <div className="space-y-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
                <div className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> Dependent Clips Detected
                </div>
                <p className="text-[11px] text-muted-foreground">
                  This source video has <strong>{deleteTarget.dependentClipsCount || 0}</strong> generated clip(s).
                </p>

                <div className="space-y-1.5 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-[11px]">
                    <input
                      type="radio"
                      name="sourceDeleteOpt"
                      checked={!sourceDeleteOptions.deleteClips}
                      onChange={() => setSourceDeleteOptions({ deleteClips: false })}
                    />
                    <span>Delete source only (Keep all generated clips safe)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-[11px] text-rose-500 font-semibold">
                    <input
                      type="radio"
                      name="sourceDeleteOpt"
                      checked={sourceDeleteOptions.deleteClips}
                      onChange={() => setSourceDeleteOptions({ deleteClips: true })}
                    />
                    <span>Delete source AND all {deleteTarget.dependentClipsCount || 0} generated clips</span>
                  </label>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSingleDelete(isTrashTab)}
                className="px-5 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs shadow-sm transition-colors"
              >
                {isTrashTab ? 'Delete Permanently' : 'Move to Trash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Bulk Delete Modal */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="vice-card max-w-md w-full p-6 space-y-4 border border-border bg-card text-foreground shadow-2xl">
            <div className="flex items-center gap-3 text-rose-500 border-b border-border pb-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/15 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-foreground">
                  {isTrashTab ? `Permanently Delete ${selectedIds.size} Items?` : `Move ${selectedIds.size} Items to Trash?`}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {isTrashTab
                    ? 'This will unlink all associated storage files permanently.'
                    : 'You can restore these items anytime from the Trash tab.'}
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Are you sure you want to {isTrashTab ? 'permanently delete' : 'move to Trash'} all {selectedIds.size} selected items?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
              <button
                onClick={() => setBulkDeleteConfirm(false)}
                className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => handleBulkDelete(isTrashTab)}
                className="px-5 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs shadow-sm"
              >
                {isTrashTab ? 'Delete Permanently' : 'Move to Trash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Rename Modal */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="vice-card max-w-md w-full p-6 space-y-4 border border-border bg-card text-foreground shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-primary" /> Rename Video
              </h3>
              <button onClick={() => setRenameTarget(null)} className="text-muted-foreground hover:text-foreground">
                ✕
              </button>
            </div>

            <form onSubmit={handleRenameSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">Title</label>
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

      {/* Publish Now Modal */}
      {mediaPublishClip && (
        <PublishModal
          isOpen={Boolean(mediaPublishClip)}
          onClose={() => setMediaPublishClip(null)}
          clip={mediaPublishClip}
          onSuccess={() => {
            setMediaPublishClip(null);
            loadMedia();
          }}
        />
      )}

      {/* Schedule Modal */}
      {mediaScheduleClip && (
        <ScheduleModal
          isOpen={Boolean(mediaScheduleClip)}
          onClose={() => setMediaScheduleClip(null)}
          clip={mediaScheduleClip}
          onSuccess={() => {
            setMediaScheduleClip(null);
            loadMedia();
          }}
        />
      )}
    </div>
  );
}

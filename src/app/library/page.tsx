'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Film,
  Play,
  Scissors,
  Share2,
  Trash2,
  Search,
  Filter,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  Sparkles,
  ExternalLink,
  Layers,
  Video,
  Download,
  AlertCircle,
  Eye,
  X,
  RefreshCw,
  FolderKanban,
  Flame,
} from 'lucide-react';
import { Pagination } from '@/components/ui/pagination';
import { ScheduleCalendar, CalendarEvent } from '@/components/calendar/schedule-calendar';
import { cn } from '@/lib/utils';

interface MediaItem {
  id: string;
  media_type: 'source' | 'extracted' | 'rendered' | 'published' | 'scheduled';
  title: string;
  duration: number;
  status: string;
  created_at: string;
  file_path: string;
  preview_url: string;
  resolution: string;
  category: string;
  platform: string;
  project_id: string;
  project_title?: string;
  scheduled_at?: string;
  file_size?: number;
  qa_score?: number;
}

interface MediaCounts {
  totalAll: number;
  sourceVideos: number;
  extractedClips: number;
  editedVideos: number;
  publishedVideos: number;
  scheduledVideos: number;
  totalClips: number;
}

function MediaLibraryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Query state initialized from URL search params for deep linking and refresh preservation
  const initialPage = parseInt(searchParams.get('page') || '1', 10);
  const initialPageSize = parseInt(searchParams.get('pageSize') || '24', 10);
  const initialType = searchParams.get('type') || 'all';
  const initialSearch = searchParams.get('search') || '';
  const initialStatus = searchParams.get('status') || 'all';
  const initialCategory = searchParams.get('category') || 'all';
  const initialPlatform = searchParams.get('platform') || 'all';
  const initialDuration = searchParams.get('duration') || 'all';
  const initialDate = searchParams.get('date') || null;
  const initialSort = searchParams.get('sort') || 'newest';

  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [mediaType, setMediaType] = useState(initialType);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [categoryFilter, setCategoryFilter] = useState(initialCategory);
  const [platformFilter, setPlatformFilter] = useState(initialPlatform);
  const [durationFilter, setDurationFilter] = useState(initialDuration);
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate);
  const [sortOrder, setSortOrder] = useState(initialSort);

  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<Record<string, CalendarEvent[]>>({});

  const [items, setItems] = useState<MediaItem[]>([]);
  const [counts, setCounts] = useState<MediaCounts>({
    totalAll: 0,
    sourceVideos: 0,
    extractedClips: 0,
    editedVideos: 0,
    publishedVideos: 0,
    scheduledVideos: 0,
    totalClips: 0,
  });
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Video preview modal
  const [activePreview, setActivePreview] = useState<MediaItem | null>(null);

  // Deletion feedback
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Sync state to URL without reloading
  const updateUrlParams = useCallback(
    (params: Record<string, string | number | null | undefined>) => {
      const url = new URL(window.location.href);
      Object.entries(params).forEach(([key, val]) => {
        if (val === null || val === undefined || val === '' || val === 'all') {
          url.searchParams.delete(key);
        } else {
          url.searchParams.set(key, String(val));
        }
      });
      window.history.replaceState({}, '', url.toString());
    },
    []
  );

  // Fetch paginated library data
  const fetchLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (mediaType !== 'all') params.set('type', mediaType);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (platformFilter !== 'all') params.set('platform', platformFilter);
      if (durationFilter !== 'all') params.set('duration', durationFilter);
      if (selectedDate) params.set('date', selectedDate);
      if (sortOrder !== 'newest') params.set('sort', sortOrder);

      const res = await fetch(`/api/library?${params.toString()}`);
      const data = await res.json();

      if (data.items) {
        setItems(data.items);
        setTotal(data.pagination.total);
        setTotalPages(data.pagination.totalPages);
        if (data.counts) {
          setCounts(data.counts);
        }
      }
    } catch (err) {
      console.error('Failed to load media library:', err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, mediaType, searchQuery, statusFilter, categoryFilter, platformFilter, durationFilter, selectedDate, sortOrder]);

  // Fetch calendar events
  const fetchCalendarEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/calendar');
      const data = await res.json();
      if (data.events) {
        setCalendarEvents(data.events);
      }
    } catch (err) {
      console.error('Failed to load calendar events:', err);
    }
  }, []);

  useEffect(() => {
    fetchLibrary();
    fetchCalendarEvents();
  }, [fetchLibrary, fetchCalendarEvents]);

  // Update URL whenever key query filters change
  useEffect(() => {
    updateUrlParams({
      page: page > 1 ? page : null,
      pageSize: pageSize !== 24 ? pageSize : null,
      type: mediaType,
      search: searchQuery || null,
      status: statusFilter,
      category: categoryFilter,
      platform: platformFilter,
      duration: durationFilter,
      date: selectedDate,
      sort: sortOrder,
    });
  }, [page, pageSize, mediaType, searchQuery, statusFilter, categoryFilter, platformFilter, durationFilter, selectedDate, sortOrder, updateUrlParams]);

  // Handle Filter Changes (resets to page 1 as required)
  const handleTypeChange = (newType: string) => {
    setMediaType(newType);
    setSelectedDate(null); // clear date filter when switching tabs
    setPage(1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setPage(1);
  };

  const handleStatusChange = (val: string) => {
    setStatusFilter(val);
    setPage(1);
  };

  const handleCategoryChange = (val: string) => {
    setCategoryFilter(val);
    setPage(1);
  };

  const handlePlatformChange = (val: string) => {
    setPlatformFilter(val);
    setPage(1);
  };

  const handleDurationChange = (val: string) => {
    setDurationFilter(val);
    setPage(1);
  };

  const handleSortChange = (val: string) => {
    setSortOrder(val);
    setPage(1);
  };

  const handleDateSelect = (date: string | null) => {
    setSelectedDate(date);
    setPage(1);
  };

  // Video deletion
  const handleDeleteVideo = async (item: MediaItem) => {
    if (!confirm(`Are you sure you want to delete "${item.title}"?`)) return;

    setDeletingId(item.id);
    try {
      const res = await fetch(`/api/library?id=${encodeURIComponent(item.id)}&type=${item.media_type}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (data.success) {
        setFeedbackMessage(`✓ Deleted "${item.title}"`);
        setTimeout(() => setFeedbackMessage(null), 3000);
        // Refresh library to update counts and active page
        fetchLibrary();
        fetchCalendarEvents();
      }
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const formatDuration = (sec: number) => {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[11px] font-bold mb-1.5">
            <Layers className="w-3.5 h-3.5" />
            Central Media & Video Asset Vault
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
            <Film className="w-6 h-6 text-primary" />
            Media Library & Video Management
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Server-side paginated repository for all gameplay recordings, extracted highlights, vertical shorts, and scheduled social posts.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          {/* Calendar Toggle Button */}
          <button
            onClick={() => setShowCalendar((prev) => !prev)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all',
              showCalendar || selectedDate
                ? 'bg-primary text-[#194350] border-primary shadow-sm'
                : 'bg-background hover:bg-muted text-foreground border-border'
            )}
          >
            <CalendarIcon className="w-4 h-4" />
            <span>{showCalendar ? 'Hide Calendar' : 'Schedule & Upload Calendar'}</span>
            {selectedDate && <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping ml-1" />}
          </button>

          <Link
            href="/projects/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] px-4 py-2 text-xs font-bold text-[#194350] shadow-sm hover:opacity-95 transition-opacity"
          >
            <Video className="w-4 h-4 stroke-[2.5]" />
            New Short
          </Link>
        </div>
      </div>

      {/* Temporary Feedback Banner */}
      {feedbackMessage && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {/* TOP METRIC CARDS (Exact Database Counts & One-Click Filter Triggers) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* All Videos Button Card - Clicking this shows ALL videos as explicitly requested */}
        <button
          type="button"
          onClick={() => handleTypeChange('all')}
          className={cn(
            'vice-card p-3.5 text-left rounded-xl border transition-all flex flex-col justify-between group cursor-pointer',
            mediaType === 'all' && !selectedDate
              ? 'ring-2 ring-primary border-primary bg-primary/10 shadow-sm'
              : 'hover:border-primary/40 bg-card border-border'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              All Videos
            </span>
            <Film className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-black text-foreground">
              {counts.totalAll.toLocaleString()}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Click to view all</p>
          </div>
        </button>

        {/* Source Videos */}
        <button
          type="button"
          onClick={() => handleTypeChange('source')}
          className={cn(
            'vice-card p-3.5 text-left rounded-xl border transition-all flex flex-col justify-between group cursor-pointer',
            mediaType === 'source'
              ? 'ring-2 ring-primary border-primary bg-primary/10 shadow-sm'
              : 'hover:border-primary/40 bg-card border-border'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Source Videos
            </span>
            <Video className="w-4 h-4 text-blue-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-black text-foreground">
              {counts.sourceVideos.toLocaleString()}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Original footage</p>
          </div>
        </button>

        {/* Extracted Clips */}
        <button
          type="button"
          onClick={() => handleTypeChange('extracted')}
          className={cn(
            'vice-card p-3.5 text-left rounded-xl border transition-all flex flex-col justify-between group cursor-pointer',
            mediaType === 'extracted'
              ? 'ring-2 ring-primary border-primary bg-primary/10 shadow-sm'
              : 'hover:border-primary/40 bg-card border-border'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Extracted Clips
            </span>
            <Scissors className="w-4 h-4 text-amber-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-black text-foreground">
              {counts.extractedClips.toLocaleString()}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Raw highlight cuts</p>
          </div>
        </button>

        {/* Edited Shorts */}
        <button
          type="button"
          onClick={() => handleTypeChange('rendered')}
          className={cn(
            'vice-card p-3.5 text-left rounded-xl border transition-all flex flex-col justify-between group cursor-pointer',
            mediaType === 'rendered'
              ? 'ring-2 ring-primary border-primary bg-primary/10 shadow-sm'
              : 'hover:border-primary/40 bg-card border-border'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Edited Shorts
            </span>
            <Sparkles className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-black text-foreground">
              {counts.editedVideos.toLocaleString()}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">9:16 vertical shorts</p>
          </div>
        </button>

        {/* Published Videos */}
        <button
          type="button"
          onClick={() => handleTypeChange('published')}
          className={cn(
            'vice-card p-3.5 text-left rounded-xl border transition-all flex flex-col justify-between group cursor-pointer',
            mediaType === 'published'
              ? 'ring-2 ring-primary border-primary bg-primary/10 shadow-sm'
              : 'hover:border-primary/40 bg-card border-border'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Published
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-black text-foreground">
              {counts.publishedVideos.toLocaleString()}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Live social posts</p>
          </div>
        </button>

        {/* Scheduled Videos */}
        <button
          type="button"
          onClick={() => handleTypeChange('scheduled')}
          className={cn(
            'vice-card p-3.5 text-left rounded-xl border transition-all flex flex-col justify-between group cursor-pointer',
            mediaType === 'scheduled'
              ? 'ring-2 ring-primary border-primary bg-primary/10 shadow-sm'
              : 'hover:border-primary/40 bg-card border-border'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Scheduled
            </span>
            <Clock className="w-4 h-4 text-purple-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-black text-foreground">
              {counts.scheduledVideos.toLocaleString()}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Upcoming queue</p>
          </div>
        </button>
      </div>

      {/* SCHEDULE & UPLOAD CALENDAR ACCORDION / DRAWER */}
      {showCalendar && (
        <div className="animate-fade-in">
          <ScheduleCalendar
            events={calendarEvents}
            selectedDate={selectedDate}
            onSelectDate={handleDateSelect}
          />
        </div>
      )}

      {/* SEARCH AND MULTI-FILTER TOOLBAR */}
      <div className="vice-card p-4 space-y-4 border border-border bg-card">
        {/* Row 1: Search & Type Tabs */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search by video title, ID, stream source, or event tags..."
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-background border border-border text-foreground text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Type Quick Selector Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0 shrink-0">
            {[
              { id: 'all', label: 'All Videos' },
              { id: 'source', label: 'Source' },
              { id: 'extracted', label: 'Extracted' },
              { id: 'rendered', label: 'Edited Shorts' },
              { id: 'published', label: 'Published' },
              { id: 'scheduled', label: 'Scheduled' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTypeChange(tab.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all',
                  mediaType === tab.id
                    ? 'bg-primary text-[#194350] shadow-sm font-extrabold'
                    : 'bg-background hover:bg-muted text-foreground border border-border'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Secondary Filters & Sorters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 pt-3 border-t border-border">
          {/* Category Filter */}
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
              Category
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full bg-background border border-border text-foreground text-xs rounded-lg px-2.5 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All Categories</option>
              <option value="epic_stunts">High-Octane Stunts</option>
              <option value="funny_moments">Funny Gameplay</option>
              <option value="police_chases">Police Chases</option>
              <option value="gunfights">Intense Shootouts</option>
              <option value="fails">Spectacular Fails</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
              Processing Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="w-full bg-background border border-border text-foreground text-xs rounded-lg px-2.5 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All Statuses</option>
              <option value="rendered">Rendered & Ready</option>
              <option value="extracted">Extracted</option>
              <option value="PUBLISHED">Published</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="failed">Failed / Error</option>
            </select>
          </div>

          {/* Platform Filter */}
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
              Platform
            </label>
            <select
              value={platformFilter}
              onChange={(e) => handlePlatformChange(e.target.value)}
              className="w-full bg-background border border-border text-foreground text-xs rounded-lg px-2.5 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All Platforms</option>
              <option value="youtube_shorts">YouTube Shorts</option>
              <option value="instagram_reels">Instagram Reels</option>
              <option value="tiktok">TikTok</option>
              <option value="vertical_9_16">9:16 Vertical Master</option>
            </select>
          </div>

          {/* Duration Filter */}
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
              Duration
            </label>
            <select
              value={durationFilter}
              onChange={(e) => handleDurationChange(e.target.value)}
              className="w-full bg-background border border-border text-foreground text-xs rounded-lg px-2.5 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">Any Duration</option>
              <option value="<15">&lt; 15 seconds</option>
              <option value="15-30">15 – 30 seconds</option>
              <option value="30-60">30 – 60 seconds</option>
              <option value=">60">&gt; 60 seconds</option>
            </select>
          </div>

          {/* Sort Filter */}
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
              Sort By
            </label>
            <select
              value={sortOrder}
              onChange={(e) => handleSortChange(e.target.value)}
              className="w-full bg-background border border-border text-foreground text-xs rounded-lg px-2.5 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="duration_desc">Longest Duration</option>
              <option value="duration_asc">Shortest Duration</option>
              <option value="score_desc">Highest Quality Score</option>
              <option value="title">Title (A–Z)</option>
            </select>
          </div>
        </div>

        {/* Date Filter Tag if Active */}
        {selectedDate && (
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <span className="text-xs font-semibold text-muted-foreground">Active Date Filter:</span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-bold border border-primary/30">
              <CalendarIcon className="w-3.5 h-3.5" />
              {selectedDate}
              <button
                onClick={() => setSelectedDate(null)}
                className="hover:text-foreground ml-1"
                aria-label="Clear date"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          </div>
        )}
      </div>

      {/* VIDEO GRID LISTING */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="vice-card overflow-hidden border border-border bg-card animate-pulse space-y-3"
            >
              <div className="aspect-[9/16] bg-muted/60" />
              <div className="p-3 space-y-2">
                <div className="h-4 bg-muted/60 rounded w-3/4" />
                <div className="h-3 bg-muted/40 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="vice-card p-12 text-center space-y-3 border border-border bg-card">
          <Film className="w-12 h-12 text-muted-foreground mx-auto" />
          <h3 className="font-bold text-sm text-foreground">No Videos Matched Your Filters</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {selectedDate
              ? `There are no videos scheduled or recorded on ${selectedDate}.`
              : 'Try clearing your search query or reset the filter dropdowns to view all videos.'}
          </p>
          <button
            onClick={() => {
              setMediaType('all');
              setSearchQuery('');
              setStatusFilter('all');
              setCategoryFilter('all');
              setPlatformFilter('all');
              setDurationFilter('all');
              setSelectedDate(null);
              setPage(1);
            }}
            className="inline-flex px-4 py-2 rounded-xl bg-primary text-[#194350] font-bold text-xs shadow-sm hover:opacity-95"
          >
            Reset All Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
          {items.map((item) => {
            const isRendered = item.status === 'rendered' || item.status === 'ready';
            const isPublished = item.status === 'PUBLISHED';
            const isScheduled = item.status === 'SCHEDULED';
            const isVertical = item.media_type === 'rendered' || item.media_type === 'published' || item.media_type === 'scheduled';

            return (
              <div
                key={`${item.media_type}-${item.id}`}
                className="vice-card overflow-hidden flex flex-col justify-between border border-border bg-card hover:border-primary/50 transition-all group"
              >
                {/* Video Media Container with Standard Uniform Aspect Ratio */}
                <div className={cn(
                  'relative bg-black overflow-hidden flex items-center justify-center',
                  isVertical ? 'aspect-[9/16] max-h-[360px]' : 'aspect-video'
                )}>
                  {item.preview_url ? (
                    <video
                      src={item.preview_url}
                      controls={false}
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-muted/40 text-muted-foreground">
                      <Film className="w-8 h-8 opacity-40 mb-1" />
                      <span className="text-[10px]">Preview Not Available</span>
                    </div>
                  )}

                  {/* Play Overlay Button */}
                  <button
                    onClick={() => setActivePreview(item)}
                    className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-black/60 hover:bg-primary/90 text-white hover:text-[#194350] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-lg backdrop-blur-sm"
                    aria-label="Play video"
                  >
                    <Play className="w-5 h-5 ml-0.5 fill-current" />
                  </button>

                  {/* Top Badges */}
                  <div className="absolute top-2 left-2 flex items-center gap-1">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-black/75 text-primary tracking-wide">
                      {item.media_type.replace('_', ' ')}
                    </span>
                    {item.resolution && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-black/75 text-white">
                        {item.resolution}
                      </span>
                    )}
                  </div>

                  {/* Duration Badge Bottom Right */}
                  <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-bold text-white flex items-center gap-1">
                    <Clock className="w-3 h-3 text-primary" />
                    <span>{formatDuration(item.duration)}</span>
                  </div>
                </div>

                {/* Content & Metadata */}
                <div className="p-3 sm:p-4 space-y-2.5 flex-1 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="font-semibold">{item.category}</span>
                      <span>{formatDate(item.created_at)}</span>
                    </div>

                    <h3 className="font-bold text-xs text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                      {item.title}
                    </h3>

                    {item.project_title && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        Project: {item.project_title}
                      </p>
                    )}
                  </div>

                  {/* Status & QA Score */}
                  <div className="flex items-center justify-between pt-2 border-t border-border text-[11px]">
                    <span
                      className={cn(
                        'text-[10px] font-bold px-2 py-0.5 rounded uppercase',
                        isPublished
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                          : isScheduled
                          ? 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/30'
                          : isRendered
                          ? 'bg-primary/15 text-primary border border-primary/30'
                          : 'bg-muted text-muted-foreground border border-border'
                      )}
                    >
                      {item.status}
                    </span>

                    {item.qa_score ? (
                      <span className="text-[10px] font-bold text-muted-foreground">
                        Score: <strong className="text-foreground">{item.qa_score}</strong>/100
                      </span>
                    ) : null}
                  </div>

                  {/* Actions Toolbar */}
                  <div className="flex items-center justify-between pt-2 border-t border-border gap-1">
                    <button
                      onClick={() => setActivePreview(item)}
                      className="px-2 py-1 rounded-lg border border-border bg-background hover:bg-muted text-[11px] font-semibold text-foreground flex items-center gap-1 transition-colors"
                    >
                      <Eye className="w-3 h-3" /> Preview
                    </button>

                    <div className="flex items-center gap-1">
                      {item.media_type === 'rendered' && (
                        <Link
                          href={`/editor?clip=${item.id}`}
                          className="px-2 py-1 rounded-lg border border-border bg-background hover:bg-muted text-[11px] font-semibold text-foreground flex items-center gap-1 transition-colors"
                          title="Open in Video Editor"
                        >
                          <Scissors className="w-3 h-3 text-primary" />
                        </Link>
                      )}

                      {item.media_type === 'rendered' && (
                        <Link
                          href={`/export?clip=${item.id}`}
                          className="px-2 py-1 rounded-lg border border-primary/30 bg-primary/15 text-primary hover:bg-primary/25 text-[11px] font-bold flex items-center gap-1 transition-colors"
                          title="Publish or Schedule Short"
                        >
                          <Share2 className="w-3 h-3" />
                        </Link>
                      )}

                      <button
                        onClick={() => handleDeleteVideo(item)}
                        disabled={deletingId === item.id}
                        className="p-1 rounded-lg hover:bg-red-500/15 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-50"
                        title="Delete video record"
                        aria-label="Delete video"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* BOTTOM PAGINATION CONTROLS (Server-Side Pagination) */}
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
        itemLabel="videos"
      />

      {/* FULLSCREEN / MODAL VIDEO PLAYER PREVIEW */}
      {activePreview && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative w-full max-w-xl bg-card border border-border rounded-2xl overflow-hidden shadow-2xl space-y-3 p-4">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold text-primary uppercase">
                  {activePreview.media_type} &bull; {activePreview.resolution}
                </span>
                <h3 className="text-sm font-extrabold text-foreground truncate max-w-md">
                  {activePreview.title}
                </h3>
              </div>
              <button
                onClick={() => setActivePreview(null)}
                className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="aspect-[9/16] max-h-[520px] bg-black rounded-xl overflow-hidden flex items-center justify-center mx-auto">
              <video
                src={activePreview.preview_url}
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
              <span className="text-muted-foreground">
                Duration: <strong className="text-foreground">{formatDuration(activePreview.duration)}</strong>
              </span>
              <div className="flex items-center gap-2">
                <Link
                  href={`/editor?clip=${activePreview.id}`}
                  className="px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted font-bold text-foreground text-xs"
                >
                  Fine-Tune in Editor
                </Link>
                <Link
                  href={`/export?clip=${activePreview.id}`}
                  className="px-3 py-1.5 rounded-lg bg-primary text-[#194350] font-bold text-xs"
                >
                  Publish &amp; Schedule
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MediaLibraryPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground">Loading Media Library...</div>}>
      <MediaLibraryContent />
    </Suspense>
  );
}

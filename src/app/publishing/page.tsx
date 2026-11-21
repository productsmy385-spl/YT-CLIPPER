'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Share2,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Youtube,
  RefreshCw,
  ExternalLink,
  Trash2,
  Film,
  Sparkles,
  ShieldCheck,
  Edit2,
  Download,
  Scissors,
  Eye,
  Plus,
  RotateCcw,
  UploadCloud,
  Check,
  Layers,
} from 'lucide-react';
import { Pagination } from '@/components/ui/pagination';
import { PublishModal } from '@/components/publishing/publish-modal';
import { ScheduleModal } from '@/components/publishing/schedule-modal';
import { VideoPreviewModal } from '@/components/publishing/video-preview-modal';
import { VideoCardActions } from '@/components/publishing/video-card-actions';

type PublishingTab = 'ready' | 'uploading' | 'scheduled' | 'published' | 'failed';

function PublishingCenterContent() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as PublishingTab) || 'ready';

  const [activeTab, setActiveTab] = useState<PublishingTab>(initialTab);
  const [clips, setClips] = useState<any[]>([]);
  const [scheduledPosts, setScheduledPosts] = useState<any[]>([]);
  const [ytStatus, setYtStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Pagination states
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);

  // Modal targets
  const [activePreviewClip, setActivePreviewClip] = useState<any | null>(null);
  const [activePublishClip, setActivePublishClip] = useState<any | null>(null);
  const [activeScheduleClip, setActiveScheduleClip] = useState<any | null>(null);
  const [editingSchedulePost, setEditingSchedulePost] = useState<any | null>(null);

  // Testing & Connection states
  const [testingConnection, setTestingConnection] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Auto-open publish modal if ?publishNow=clipId parameter is present
  useEffect(() => {
    const publishNowId = searchParams.get('publishNow');
    if (publishNowId && clips.length > 0) {
      const match = clips.find((c) => c.id === publishNowId);
      if (match) {
        setActivePublishClip({
          id: match.id,
          title: match.title,
          duration: match.duration,
          resolution: match.resolution,
          previewUrl: match.finalPreviewUrl || match.rawPreviewUrl,
          filePath: match.output_path || match.raw_clip_path,
        });
      }
    }
  }, [searchParams, clips]);

  const loadAllData = async () => {
    try {
      const [clipsRes, schedRes, ytRes] = await Promise.all([
        fetch('/api/clips'),
        fetch('/api/publishing/schedule'),
        fetch('/api/youtube/status'),
      ]);

      const clipsJson = await clipsRes.json();
      const schedJson = await schedRes.json();
      const ytJson = await ytRes.json();

      setClips(clipsJson.clips || []);
      setScheduledPosts(schedJson.posts || []);
      setYtStatus(ytJson.report || ytJson);
    } catch (err) {
      console.error('[PublishingCenter] Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
    const interval = setInterval(loadAllData, 8000);
    return () => clearInterval(interval);
  }, []);

  // Connection Actions
  const handleTestConnection = async () => {
    setTestingConnection(true);
    setStatusMessage({ type: 'info', text: 'Testing YouTube Data API connectivity & upload permission...' });
    try {
      const res = await fetch('/api/youtube/test', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: 'success',
          text: data.message || `✓ Verified connection to YouTube channel "${data.channel?.title}". Upload permissions active.`,
        });
        await loadAllData();
      } else {
        setStatusMessage({
          type: 'error',
          text: `Connection test failed: ${data.error || 'Token may be expired. Click Reconnect YouTube.'}`,
        });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Connection test error: ${err.message}` });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your YouTube channel?')) return;
    try {
      await fetch('/api/youtube/disconnect', { method: 'POST' });
      setStatusMessage({ type: 'info', text: 'YouTube channel disconnected and stored tokens revoked.' });
      loadAllData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  const handleCancelSchedule = async (postId: string) => {
    if (!confirm('Cancel this scheduled video?')) return;
    try {
      const res = await fetch(`/api/publishing/schedule?id=${postId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({ type: 'info', text: '✓ Scheduled post cancelled.' });
        loadAllData();
      } else {
        alert(data.error || 'Failed to cancel schedule');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRetryFailed = async (postId: string) => {
    setStatusMessage({ type: 'info', text: 'Retrying publication now...' });
    try {
      const res = await fetch('/api/publishing/publish-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({ type: 'success', text: '✓ Video published successfully to YouTube!' });
        loadAllData();
      } else {
        setStatusMessage({ type: 'error', text: `Retry failed: ${data.error}` });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  // Categorize Videos based on Tabs
  const readyClips = useMemo(() => {
    return clips.filter((c) => {
      // Must be rendered or approved, and not yet published or actively scheduled
      const isRendered = c.status === 'rendered' || c.status === 'ready' || c.status === 'approved';
      const isPublished = c.is_published === 1 || Boolean(c.published_url);
      const isScheduled = scheduledPosts.some(
        (sp) => sp.export_file_id === c.id && (sp.status === 'SCHEDULED' || sp.status === 'PROCESSING')
      );
      return isRendered && !isPublished && !isScheduled;
    });
  }, [clips, scheduledPosts]);

  const uploadingPosts = useMemo(() => {
    return scheduledPosts.filter((sp) => sp.status === 'PROCESSING' || sp.status === 'UPLOADING');
  }, [scheduledPosts]);

  const activeScheduledPosts = useMemo(() => {
    return scheduledPosts.filter((sp) => sp.status === 'SCHEDULED');
  }, [scheduledPosts]);

  const publishedVideos = useMemo(() => {
    // Combine directly published clips and scheduled posts marked published
    const fromPosts = scheduledPosts.filter((sp) => sp.status === 'PUBLISHED');
    const fromClips = clips
      .filter((c) => c.is_published === 1 || c.published_url)
      .map((c) => ({
        id: `clip_pub_${c.id}`,
        title: c.title,
        platform: 'youtube_shorts',
        published_url: c.published_url || `https://www.youtube.com/shorts/${c.youtube_video_id || 'watch'}`,
        platform_post_id: c.youtube_video_id,
        created_at: c.updated_at || c.created_at,
        download_url: c.finalPreviewUrl || c.rawPreviewUrl,
        duration: c.duration,
        account_name: ytStatus?.channel?.title || 'YouTube Channel',
      }));

    // Merge and deduplicate by URL/ID
    const map = new Map<string, any>();
    fromPosts.forEach((p) => map.set(p.published_url || p.id, p));
    fromClips.forEach((c) => {
      if (!map.has(c.published_url)) map.set(c.published_url, c);
    });

    return Array.from(map.values());
  }, [scheduledPosts, clips, ytStatus]);

  const failedPosts = useMemo(() => {
    return scheduledPosts.filter((sp) => sp.status === 'FAILED');
  }, [scheduledPosts]);

  const isConnected = ytStatus?.connected && ytStatus?.state !== 'TOKEN_EXPIRED';
  const isExpired = ytStatus?.state === 'TOKEN_EXPIRED';
  const channel = ytStatus?.channel;

  const currentTabCount = {
    ready: readyClips.length,
    uploading: uploadingPosts.length,
    scheduled: activeScheduledPosts.length,
    published: publishedVideos.length,
    failed: failedPosts.length,
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Page Header */}
      <div className="border-b border-border pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-bold mb-2">
            <Youtube className="w-4 h-4" />
            Social Media Publishing Center
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            Publishing <span className="vice-gradient-text">&amp; Social Media Automation</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Direct YouTube Shorts &amp; Reels publishing, persistent background scheduling, and live upload tracking.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Link
            href="/projects/new"
            className="px-4 py-2 rounded-xl bg-primary text-[#194350] font-bold text-xs flex items-center gap-1.5 shadow-sm hover:opacity-95"
          >
            <Plus className="w-3.5 h-3.5" /> Ingest &amp; Edit Video
          </Link>
        </div>
      </div>

      {/* 6. YOUTUBE CONNECTION STATUS BANNER (At top of Publishing Center) */}
      <div className="vice-card p-5 border border-border bg-card rounded-2xl shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {channel?.thumbnailUrl ? (
              <img
                src={channel.thumbnailUrl}
                alt={channel.title}
                className="w-14 h-14 rounded-full border-2 border-primary/40 object-cover shadow-sm shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-rose-500/15 border-2 border-rose-500/30 text-rose-500 flex items-center justify-center font-black text-xl shrink-0">
                <Youtube className="w-7 h-7" />
              </div>
            )}

            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-extrabold text-foreground">
                  {channel?.title || 'YouTube Channel'}
                </h3>

                {isConnected ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> CONNECTED &amp; VERIFIED
                  </span>
                ) : isExpired ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> REAUTH REQUIRED
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-muted text-muted-foreground border border-border">
                    NOT CONNECTED
                  </span>
                )}
              </div>

              <div className="text-xs text-muted-foreground font-mono flex items-center gap-3 flex-wrap">
                <span>Channel ID: <strong className="text-foreground">{channel?.id || '—'}</strong></span>
                {channel?.customUrl && <span>Handle: {channel.customUrl}</span>}
                {channel?.subscribers && <span>Subscribers: {channel.subscribers}</span>}
              </div>
            </div>
          </div>

          {/* Action buttons on YouTube Banner */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {isConnected ? (
              <>
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  className="px-3.5 py-2 rounded-xl border border-border bg-background hover:bg-muted font-bold text-xs text-foreground flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  title="Verify channel connectivity & upload permissions"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-primary ${testingConnection ? 'animate-spin' : ''}`} />
                  Test Connection
                </button>

                <a
                  href="/api/youtube/connect"
                  className="px-3.5 py-2 rounded-xl border border-border bg-background hover:bg-muted font-bold text-xs text-foreground flex items-center gap-1.5 transition-colors"
                  title="Refresh OAuth credentials via Google Sign-In"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                  Reconnect
                </a>

                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="px-3.5 py-2 rounded-xl hover:bg-rose-500/10 text-rose-500 border border-rose-500/20 font-bold text-xs transition-colors"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <a
                href="/api/youtube/connect"
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] text-[#194350] font-extrabold text-xs flex items-center gap-2 shadow-md hover:opacity-95 transition-all"
              >
                <Youtube className="w-4 h-4" /> Connect YouTube Channel
              </a>
            )}
          </div>
        </div>

        {/* Status notice */}
        {statusMessage && (
          <div
            className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 animate-fade-in ${
              statusMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : statusMessage.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-500'
                : 'bg-primary/10 border-primary/30 text-primary'
            }`}
          >
            <span>{statusMessage.text}</span>
            <button onClick={() => setStatusMessage(null)} className="opacity-70 hover:opacity-100">
              &times;
            </button>
          </div>
        )}
      </div>

      {/* 5. DEDICATED PUBLISHING CENTER TABS */}
      <div className="flex items-center gap-2 border-b border-border overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => { setActiveTab('ready'); setPage(1); }}
          className={`py-2 px-4 rounded-xl font-bold flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === 'ready'
              ? 'bg-primary text-[#194350] shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <Film className="w-4 h-4" /> Ready to Publish
          <span className="px-1.5 py-0.2 rounded-full bg-black/15 font-mono text-[10px]">
            {currentTabCount.ready}
          </span>
        </button>

        <button
          onClick={() => { setActiveTab('uploading'); setPage(1); }}
          className={`py-2 px-4 rounded-xl font-bold flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === 'uploading'
              ? 'bg-primary text-[#194350] shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <UploadCloud className="w-4 h-4" /> Uploading
          {currentTabCount.uploading > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white font-mono text-[10px] animate-pulse">
              {currentTabCount.uploading}
            </span>
          )}
        </button>

        <button
          onClick={() => { setActiveTab('scheduled'); setPage(1); }}
          className={`py-2 px-4 rounded-xl font-bold flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === 'scheduled'
              ? 'bg-primary text-[#194350] shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <Calendar className="w-4 h-4" /> Scheduled
          <span className="px-1.5 py-0.2 rounded-full bg-black/15 font-mono text-[10px]">
            {currentTabCount.scheduled}
          </span>
        </button>

        <button
          onClick={() => { setActiveTab('published'); setPage(1); }}
          className={`py-2 px-4 rounded-xl font-bold flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === 'published'
              ? 'bg-primary text-[#194350] shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" /> Published
          <span className="px-1.5 py-0.2 rounded-full bg-black/15 font-mono text-[10px]">
            {currentTabCount.published}
          </span>
        </button>

        <button
          onClick={() => { setActiveTab('failed'); setPage(1); }}
          className={`py-2 px-4 rounded-xl font-bold flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === 'failed'
              ? 'bg-primary text-[#194350] shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <AlertCircle className="w-4 h-4" /> Failed
          {currentTabCount.failed > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white font-mono text-[10px]">
              {currentTabCount.failed}
            </span>
          )}
        </button>
      </div>

      {/* TAB CONTENT PRESENTATION */}
      {loading ? (
        <div className="vice-card p-16 text-center text-xs text-muted-foreground space-y-2">
          <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p>Loading publishing library...</p>
        </div>
      ) : activeTab === 'ready' ? (
        /* TAB 1: READY TO PUBLISH */
        readyClips.length === 0 ? (
          <div className="vice-card p-16 text-center space-y-3">
            <Film className="w-10 h-10 text-muted-foreground mx-auto opacity-50" />
            <h3 className="font-bold text-sm text-foreground">No Videos Ready to Publish</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Ingest a YouTube video or start a new project to generate 9:16 vertical shorts.
            </p>
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-[#194350] font-bold text-xs"
            >
              <Plus className="w-3.5 h-3.5" /> Create Shorts
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {readyClips.map((clip) => {
              const previewUrl = clip.finalPreviewUrl || clip.rawPreviewUrl || `/api/media/preview?id=${clip.id}`;
              const filePath = clip.output_path || clip.raw_clip_path;

              return (
                <div
                  key={clip.id}
                  className="vice-card overflow-hidden border border-border bg-card p-4 rounded-2xl flex flex-col justify-between space-y-3 transition-all hover:border-primary/50 group"
                >
                  <div className="space-y-2.5">
                    {/* Video Poster Preview */}
                    <div
                      onClick={() => setActivePreviewClip({ ...clip, previewUrl, filePath })}
                      className="relative aspect-[9/16] bg-black rounded-xl overflow-hidden border border-border cursor-pointer group-hover:shadow-md transition-shadow"
                    >
                      <video
                        src={previewUrl}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <div className="w-10 h-10 rounded-full bg-primary/90 text-[#194350] flex items-center justify-center shadow-lg">
                          <Eye className="w-5 h-5 ml-0.5 fill-current" />
                        </div>
                      </div>
                      <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/75 text-[9px] font-bold text-white font-mono">
                        {clip.duration ? `${clip.duration.toFixed(1)}s` : '30s'} &bull; 9:16
                      </div>
                    </div>

                    {/* Metadata */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 uppercase">
                          {clip.categoryLabel || clip.category || 'ACTION'}
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 uppercase">
                          RENDERED
                        </span>
                      </div>
                      <h4 className="font-bold text-xs text-foreground line-clamp-1" title={clip.title}>
                        {clip.title}
                      </h4>
                      <p className="text-[10px] text-muted-foreground truncate">{clip.projectTitle || 'GTA 6 Studio'}</p>
                    </div>
                  </div>

                  {/* Complete Action Toolbar (Publish Now, Schedule, Preview, Download, Edit, More) */}
                  <VideoCardActions
                    clip={{
                      id: clip.id,
                      title: clip.title,
                      duration: clip.duration,
                      resolution: '1080x1920',
                      previewUrl,
                      filePath,
                      processingStatus: 'rendered',
                      category: clip.categoryLabel,
                      createdAt: clip.created_at,
                    }}
                    onStatusUpdated={loadAllData}
                  />
                </div>
              );
            })}
          </div>
        )
      ) : activeTab === 'uploading' ? (
        /* TAB 2: UPLOADING */
        uploadingPosts.length === 0 ? (
          <div className="vice-card p-16 text-center space-y-2">
            <UploadCloud className="w-10 h-10 text-muted-foreground mx-auto opacity-50" />
            <h3 className="font-bold text-sm text-foreground">No Active Uploads</h3>
            <p className="text-xs text-muted-foreground">
              When you click &quot;Publish Now&quot;, active upload progress appears here in real-time.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {uploadingPosts.map((post) => (
              <div
                key={post.id}
                className="vice-card p-5 border border-border bg-card rounded-2xl flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-bold shrink-0 animate-pulse">
                    <UploadCloud className="w-5 h-5" />
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <h4 className="font-bold text-xs text-foreground truncate">{post.title || post.id}</h4>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      Target: YouTube Shorts &bull; Status: In-Flight Resumable Upload
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="w-32 bg-muted rounded-full h-2 overflow-hidden border border-border">
                    <div className="bg-primary h-full animate-pulse" style={{ width: '65%' }} />
                  </div>
                  <span className="text-xs font-mono text-primary font-bold">Uploading...</span>
                </div>
              </div>
            ))}
          </div>
        )
      ) : activeTab === 'scheduled' ? (
        /* TAB 3: SCHEDULED */
        activeScheduledPosts.length === 0 ? (
          <div className="vice-card p-16 text-center space-y-3">
            <Calendar className="w-10 h-10 text-muted-foreground mx-auto opacity-50" />
            <h3 className="font-bold text-sm text-foreground">No Scheduled Videos</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Schedule videos to release automatically at peak engagement hours (e.g. 6:00 PM IST).
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {activeScheduledPosts.map((post) => {
              const schedTime = new Date(post.scheduled_at || post.scheduledAt);

              return (
                <div
                  key={post.id}
                  className="vice-card p-4 border border-border bg-card rounded-2xl flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="px-2 py-0.5 rounded-full font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> SCHEDULED
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {post.timezone || 'Asia/Kolkata'}
                      </span>
                    </div>

                    <h4 className="font-bold text-xs text-foreground line-clamp-2">{post.title || post.id}</h4>

                    <div className="p-2.5 rounded-xl bg-muted/40 border border-border text-xs space-y-1">
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-primary" />
                        <strong className="text-foreground">
                          {schedTime.toLocaleString('en-IN', {
                            timeZone: post.timezone || 'Asia/Kolkata',
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </strong>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Channel: {post.account_name || ytStatus?.channel?.title || 'YouTube Channel'}
                      </div>
                    </div>
                  </div>

                  {/* Actions for Scheduled Video */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-border text-xs">
                    <button
                      type="button"
                      onClick={() => handleCancelSchedule(post.id)}
                      className="py-1 px-2.5 rounded-lg border border-border hover:bg-rose-500/10 text-rose-500 font-semibold"
                    >
                      Cancel Schedule
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRetryFailed(post.id)}
                      className="py-1 px-3 rounded-lg bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] text-[#194350] font-extrabold flex items-center gap-1 shadow-xs"
                      title="Publish immediately without waiting for schedule"
                    >
                      <Youtube className="w-3 h-3" /> Publish Now
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : activeTab === 'published' ? (
        /* TAB 4: PUBLISHED */
        publishedVideos.length === 0 ? (
          <div className="vice-card p-16 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-muted-foreground mx-auto opacity-50" />
            <h3 className="font-bold text-sm text-foreground">No Published Videos Yet</h3>
            <p className="text-xs text-muted-foreground">
              Once videos are published to YouTube, their live watch links and metrics appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {publishedVideos.map((pub, idx) => (
              <div
                key={pub.id || idx}
                className="vice-card p-4 border border-border bg-card rounded-2xl flex flex-col justify-between space-y-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="px-2 py-0.5 rounded-full font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> LIVE ON YOUTUBE
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {pub.created_at ? new Date(pub.created_at).toLocaleDateString() : 'Published'}
                    </span>
                  </div>

                  <h4 className="font-bold text-xs text-foreground line-clamp-2">{pub.title}</h4>

                  {pub.platform_post_id && (
                    <div className="text-[10px] text-muted-foreground font-mono">
                      YouTube Video ID: {pub.platform_post_id}
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-border">
                  <a
                    href={pub.published_url}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2 px-3 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors"
                  >
                    <Youtube className="w-3.5 h-3.5" /> View on YouTube Shorts
                    <ExternalLink className="w-3 h-3 opacity-80" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* TAB 5: FAILED */
        failedPosts.length === 0 ? (
          <div className="vice-card p-16 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <h3 className="font-bold text-sm text-foreground">Zero Publishing Failures</h3>
            <p className="text-xs text-muted-foreground">All video upload attempts have succeeded cleanly.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {failedPosts.map((failed) => (
              <div
                key={failed.id}
                className="vice-card p-4 border border-rose-500/30 bg-rose-500/5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="font-bold text-foreground text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>{failed.title || failed.id}</span>
                  </div>
                  <p className="text-rose-500 text-[11px] font-mono">
                    Error: {failed.last_error || 'Upload was rejected by YouTube API.'}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleRetryFailed(failed.id)}
                    className="px-4 py-2 rounded-xl bg-primary text-[#194350] font-bold text-xs flex items-center gap-1.5 shadow-sm"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Retry Upload
                  </button>
                  <button
                    onClick={() => handleCancelSchedule(failed.id)}
                    className="p-2 rounded-xl border border-border text-muted-foreground hover:text-rose-500"
                    title="Dismiss"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Video Preview Modal */}
      {activePreviewClip && (
        <VideoPreviewModal
          isOpen={Boolean(activePreviewClip)}
          onClose={() => setActivePreviewClip(null)}
          clip={activePreviewClip}
          onStatusUpdated={loadAllData}
        />
      )}

      {/* Publish Now Modal */}
      {activePublishClip && (
        <PublishModal
          isOpen={Boolean(activePublishClip)}
          onClose={() => setActivePublishClip(null)}
          clip={activePublishClip}
          onSuccess={() => {
            setActivePublishClip(null);
            loadAllData();
          }}
        />
      )}

      {/* Schedule Modal */}
      {activeScheduleClip && (
        <ScheduleModal
          isOpen={Boolean(activeScheduleClip)}
          onClose={() => setActiveScheduleClip(null)}
          clip={activeScheduleClip}
          onSuccess={() => {
            setActiveScheduleClip(null);
            loadAllData();
          }}
        />
      )}
    </div>
  );
}

export default function PublishingCenterPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground">Loading Publishing Center...</div>}>
      <PublishingCenterContent />
    </Suspense>
  );
}

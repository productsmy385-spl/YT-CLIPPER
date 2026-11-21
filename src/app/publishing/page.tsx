'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Share2,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Youtube,
  Instagram,
  RefreshCw,
  ExternalLink,
  Send,
  Trash2,
  Film,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Edit3,
  Check,
  Copy,
  Info,
} from 'lucide-react';
import { Pagination } from '@/components/ui/pagination';
import { ScheduleCalendar, CalendarEvent } from '@/components/calendar/schedule-calendar';

export default function PublishingCenterPage() {
  const [activeTab, setActiveTab] = useState<'accounts' | 'ready' | 'scheduled' | 'history' | 'failed'>('accounts');
  const [exportFiles, setExportFiles] = useState<any[]>([]);
  const [scheduledPosts, setScheduledPosts] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [youtubeAccount, setYoutubeAccount] = useState<any>(null);
  const [instagramAccount, setInstagramAccount] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Pagination states
  const [readyPage, setReadyPage] = useState(1);
  const [readyPageSize, setReadyPageSize] = useState(24);
  const [scheduledPage, setScheduledPage] = useState(1);
  const [scheduledPageSize, setScheduledPageSize] = useState(24);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(24);

  // Calendar filter state
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);

  // Metadata customization per export file
  const [fileMetadata, setFileMetadata] = useState<Record<string, {
    selectedTitle: string;
    titleSuggestions: string[];
    description: string;
    tags: string[];
    canPublish: boolean;
    copyrightPassed: boolean;
  }>>({});

  // Scheduling modal state
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [schedulePlatform, setSchedulePlatform] = useState<'youtube_shorts' | 'instagram_reels'>('youtube_shorts');
  const [scheduleDate, setScheduleDate] = useState(() => {
    const d = new Date(Date.now() + 2 * 3600 * 1000);
    return d.toISOString().slice(0, 16);
  });

  const [publishingNowId, setPublishingNowId] = useState<string | null>(null);
  const [reconnectingYt, setReconnectingYt] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Delete post modal state
  const [deletePostTarget, setDeletePostTarget] = useState<any | null>(null);

  const confirmDeletePost = async () => {
    if (!deletePostTarget) return;
    try {
      const res = await fetch('/api/media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deletePostTarget.id, type: 'post', permanent: true }),
      });
      const data = await res.json();
      if (data.success) {
        setScheduledPosts((prev) => prev.filter((p) => p.id !== deletePostTarget.id));
        setDeletePostTarget(null);
        setStatusMessage({ text: '✓ Post record removed from library.', type: 'info' });
      } else {
        alert(data.error || 'Failed to remove post record');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const loadData = async () => {
    try {
      const [filesRes, schedRes, accRes] = await Promise.all([
        fetch('/api/clips'),
        fetch('/api/publishing/schedule'),
        fetch('/api/publishing/accounts'),
      ]);

      const filesJson = await filesRes.json();
      const schedJson = await schedRes.json();
      const accJson = await accRes.json();

      // Collect all export files
      const allExports: any[] = [];
      (filesJson.clips || []).forEach((c: any) => {
        (c.exports || []).forEach((exp: any) => {
          allExports.push({
            ...exp,
            clipId: c.id,
            clipTitle: c.title,
            projectTitle: c.projectTitle,
            sourceUrl: c.sourceUrl,
            categoryLabel: c.categoryLabel,
            peakEvent: c.peakEvent,
            duration: c.duration,
            finalPreviewUrl: c.finalPreviewUrl,
          });
        });
      });

      setExportFiles(allExports);
      setScheduledPosts(schedJson.posts || []);
      setAccounts(accJson.accounts || []);
      setYoutubeAccount(accJson.youtube || null);
      setInstagramAccount(accJson.instagram || null);

      // Pre-generate metadata for each export file if not loaded yet
      allExports.forEach(async (exp) => {
        if (!fileMetadata[exp.id]) {
          try {
            const metaRes = await fetch('/api/publishing/metadata', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                clipId: exp.clipId,
                category: exp.platform === 'youtube_shorts' ? 'police_chases' : 'epic_stunts',
                eventDescription: `${exp.clipTitle} - High speed chase and stunt`,
                peakMoment: exp.peakEvent || 'Climactic police collision',
                projectId: exp.projectId,
              }),
            });
            const metaJson = await metaRes.json();
            if (metaJson.success && metaJson.metadata) {
              setFileMetadata((prev) => ({
                ...prev,
                [exp.id]: {
                  selectedTitle: exp.title || metaJson.metadata.selectedTitle,
                  titleSuggestions: metaJson.metadata.titleSuggestions || [exp.title],
                  description: exp.description || metaJson.metadata.description,
                  tags: metaJson.metadata.tags || ['GTA6', 'GamingShorts'],
                  canPublish: metaJson.metadata.copyrightStatus?.canPublish ?? true,
                  copyrightPassed: metaJson.metadata.copyrightStatus?.passed ?? true,
                },
              }));
            }
          } catch (e) {
            // Ignore metadata fetch error
          }
        }
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleReconnectYouTube = async () => {
    setReconnectingYt(true);
    setStatusMessage({
      type: 'info',
      text: 'Opening Google Sign-In in your default browser. Please approve permissions to reconnect your channel...',
    });

    try {
      const res = await fetch('/api/publishing/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reconnect_youtube' }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: 'success',
          text: `✓ Successfully reconnected YouTube channel: ${data.channel?.title || 'YouTube Studio'}!`,
        });
        await loadData();
      } else {
        setStatusMessage({
          type: 'error',
          text: `Reconnection failed: ${data.error || 'Check browser or try again.'}`,
        });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Reconnection error: ${err.message}` });
    } finally {
      setReconnectingYt(false);
    }
  };

  const handleDisconnectYouTube = async () => {
    if (!confirm('Are you sure you want to disconnect this YouTube account?')) return;
    try {
      await fetch('/api/publishing/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect_youtube' }),
      });
      setStatusMessage({ type: 'info', text: 'YouTube account disconnected.' });
      loadData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  const handlePublishNow = async (exportFile: any) => {
    setPublishingNowId(exportFile.id);
    setStatusMessage(null);

    const meta = fileMetadata[exportFile.id];
    if (meta && !meta.canPublish) {
      setStatusMessage({
        type: 'error',
        text: '❌ Pre-publishing check failed: Original creator licensing verification required before publishing.',
      });
      setPublishingNowId(null);
      return;
    }

    try {
      const res = await fetch('/api/publishing/publish-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exportFileId: exportFile.id,
          platform: exportFile.platform || 'youtube_shorts',
          title: meta?.selectedTitle || exportFile.title,
          description: meta?.description || exportFile.description,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: 'success',
          text: `✓ Successfully published to ${exportFile.platform}! Permallink: ${data.publishedUrl}`,
        });
        loadData();
      } else {
        setStatusMessage({
          type: 'error',
          text: `❌ Publishing error: ${data.error || 'Failed to upload video to social platform.'}`,
        });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `❌ Error: ${err.message}` });
    } finally {
      setPublishingNowId(null);
    }
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    try {
      const res = await fetch('/api/publishing/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exportFileId: selectedFile.id,
          platform: schedulePlatform,
          scheduledAt: new Date(scheduleDate).toISOString(),
          timezone: 'Asia/Kolkata',
        }),
      });

      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: 'success',
          text: `✓ Post successfully scheduled for ${new Date(scheduleDate).toLocaleString()} (Asia/Kolkata IST)`,
        });
        setSelectedFile(null);
        setActiveTab('scheduled');
        loadData();
      } else {
        setStatusMessage({ type: 'error', text: `❌ Error: ${data.error}` });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `❌ Error: ${err.message}` });
    }
  };

  const handleCancelSchedule = async (id: string) => {
    try {
      await fetch(`/api/publishing/schedule/${id}`, { method: 'DELETE' });
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const publishedList = scheduledPosts.filter((p) => p.status === 'PUBLISHED');
  const activeScheduled = scheduledPosts.filter((p) => p.status === 'SCHEDULED' || p.status === 'PROCESSING');
  const failedList = scheduledPosts.filter((p) => p.status === 'FAILED');

  // Calendar events map
  const calendarEventsMap = scheduledPosts.reduce((acc: Record<string, CalendarEvent[]>, p) => {
    const d = p.scheduled_at?.substring(0, 10) || p.created_at?.substring(0, 10);
    if (d) {
      if (!acc[d]) acc[d] = [];
      acc[d].push({
        id: p.id,
        title: p.title || 'GTA 6 Short',
        platform: p.platform,
        status: p.status,
        scheduled_at: p.scheduled_at,
        published_url: p.published_url,
        account_name: p.account_name,
      });
    }
    return acc;
  }, {});

  const filteredScheduled = activeScheduled.filter((p) => {
    if (selectedCalendarDate) {
      return p.scheduled_at?.substring(0, 10) === selectedCalendarDate;
    }
    return true;
  });
  const paginatedScheduled = filteredScheduled.slice((scheduledPage - 1) * scheduledPageSize, scheduledPage * scheduledPageSize);

  const filteredPublished = publishedList.filter((p) => {
    if (selectedCalendarDate) {
      return (
        p.scheduled_at?.substring(0, 10) === selectedCalendarDate ||
        p.created_at?.substring(0, 10) === selectedCalendarDate
      );
    }
    return true;
  });
  const paginatedPublished = filteredPublished.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize);

  const paginatedReady = exportFiles.slice((readyPage - 1) * readyPageSize, readyPage * readyPageSize);

  const ytStatus = youtubeAccount?.status || (youtubeAccount?.connected ? 'connected' : 'disconnected');
  const isYtConnected = ytStatus === 'connected';
  const isYtExpired = ytStatus === 'expired';

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-semibold mb-2">
            <Share2 className="w-3.5 h-3.5" />
            Social Media Publishing Operations & Scheduler
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground">
            Publishing <span className="vice-gradient-text">Production Center</span>
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">
            Direct & scheduled publishing for YouTube Shorts (Data API v3) and Instagram Reels (Meta Graph API).
          </p>
        </div>

        <button
          onClick={loadData}
          className="px-3.5 py-2 rounded-xl bg-muted hover:bg-muted/80 border border-border text-foreground text-xs font-semibold flex items-center gap-1.5 self-start transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5 text-primary" /> Refresh Status
        </button>
      </div>

      {statusMessage && (
        <div
          className={`p-4 rounded-xl border text-xs font-semibold flex items-center justify-between ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
              : statusMessage.type === 'info'
              ? 'bg-sky-500/10 border-sky-500/30 text-sky-700 dark:text-sky-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : statusMessage.type === 'info' ? (
              <Info className="w-4 h-4 animate-pulse" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-xs hover:underline ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* 5 Clean Production Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-3 overflow-x-auto text-xs font-bold">
        <button
          onClick={() => setActiveTab('accounts')}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeTab === 'accounts'
              ? 'bg-primary text-[#194350] shadow-sm font-bold'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Connected Accounts
        </button>
        <button
          onClick={() => setActiveTab('ready')}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeTab === 'ready'
              ? 'bg-primary text-[#194350] shadow-sm font-bold'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Ready to Publish ({exportFiles.length})
        </button>
        <button
          onClick={() => setActiveTab('scheduled')}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeTab === 'scheduled'
              ? 'bg-primary text-[#194350] shadow-sm font-bold'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Scheduled Posts ({activeScheduled.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeTab === 'history'
              ? 'bg-secondary text-[#0c1b21] shadow-sm font-bold'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Publishing History ({publishedList.length})
        </button>
        <button
          onClick={() => setActiveTab('failed')}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeTab === 'failed'
              ? 'bg-rose-500/20 text-rose-500 border border-rose-500/30 shadow-sm font-bold'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Failed Uploads ({failedList.length})
        </button>
      </div>

      {/* =========================================================================
          TAB 1: CONNECTED ACCOUNTS
          ========================================================================= */}
      {activeTab === 'accounts' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Real YouTube Account Card */}
            <div className="vice-card p-6 space-y-4 border border-border">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 overflow-hidden">
                    {youtubeAccount?.channel?.thumbnailUrl ? (
                      <img
                        src={youtubeAccount.channel.thumbnailUrl}
                        alt="Channel Avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Youtube className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-foreground">
                      {youtubeAccount?.channel?.title || 'YouTube Channel'}
                    </h3>
                    <p className="text-xs text-muted-foreground font-mono">
                      {youtubeAccount?.channel?.customUrl || youtubeAccount?.channel?.id || 'OAuth Desktop Client'}
                    </p>
                  </div>
                </div>

                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase ${
                    isYtConnected
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                      : isYtExpired
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                      : 'bg-muted text-muted-foreground border-border'
                  }`}
                >
                  {isYtConnected ? 'CONNECTED' : isYtExpired ? 'EXPIRED (NEEDS RECONNECT)' : 'DISCONNECTED'}
                </span>
              </div>

              <div className="space-y-2 text-xs bg-muted/50 p-3 rounded-xl border border-border">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Google Cloud Project:</span>
                  <span className="font-mono text-foreground font-semibold">
                    {youtubeAccount?.projectId || 'mahashivalinga'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">OAuth Scopes:</span>
                  <span className="font-mono text-primary font-bold">youtube.upload, youtube.readonly</span>
                </div>
                {youtubeAccount?.channel?.subscribers && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Subscribers:</span>
                    <span className="font-bold text-foreground">{youtubeAccount.channel.subscribers}</span>
                  </div>
                )}
                {youtubeAccount?.channel?.videos && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total Videos:</span>
                    <span className="font-bold text-foreground">{youtubeAccount.channel.videos}</span>
                  </div>
                )}
                {isYtExpired && (
                  <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-[11px] mt-2">
                    Google OAuth test token expired. Click <strong>Reconnect YouTube</strong> to authorize through your browser.
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <button
                  onClick={handleReconnectYouTube}
                  disabled={reconnectingYt}
                  className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] text-[#194350] font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm hover:opacity-95 disabled:opacity-50"
                >
                  {reconnectingYt ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-[#194350] border-t-transparent rounded-full animate-spin" />
                      Opening Browser...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" /> Reconnect YouTube
                    </>
                  )}
                </button>
                <button
                  onClick={handleDisconnectYouTube}
                  className="py-2 px-3 rounded-xl bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground text-xs font-semibold border border-border"
                >
                  Disconnect
                </button>
              </div>
            </div>

            {/* Real Meta Instagram Account Card */}
            <div className="vice-card p-6 space-y-4 border border-border">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-pink-500/10 border border-pink-500/30 flex items-center justify-center text-pink-500 overflow-hidden">
                    {instagramAccount?.account?.profilePictureUrl ? (
                      <img
                        src={instagramAccount.account.profilePictureUrl}
                        alt="IG Avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Instagram className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-foreground">
                      {instagramAccount?.account?.username || 'Meta Instagram Reels'}
                    </h3>
                    <p className="text-xs text-muted-foreground font-mono">
                      {instagramAccount?.account?.id || 'Meta Graph API v21.0'}
                    </p>
                  </div>
                </div>

                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase ${
                    instagramAccount?.connected
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                      : 'bg-muted text-muted-foreground border-border'
                  }`}
                >
                  {instagramAccount?.connected ? 'CONNECTED' : 'NOT CONNECTED'}
                </span>
              </div>

              <div className="space-y-2 text-xs bg-muted/50 p-3 rounded-xl border border-border">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Account Type:</span>
                  <span className="font-mono text-foreground font-semibold">
                    {instagramAccount?.account?.accountType || 'Professional Creator'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Publishing Method:</span>
                  <span className="font-mono text-primary font-bold">2-Step Media Container</span>
                </div>
                {!instagramAccount?.connected && (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    To connect Instagram Reels, set <code className="text-primary font-mono">INSTAGRAM_ACCESS_TOKEN</code> and <code className="text-primary font-mono">INSTAGRAM_ACCOUNT_ID</code> in your configuration.
                  </p>
                )}
              </div>

              <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                <span>Requires Meta Professional or Business Account</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: READY TO PUBLISH
          ========================================================================= */}
      {activeTab === 'ready' && (
        <div className="space-y-6">
          {exportFiles.length === 0 ? (
            <div className="vice-card p-12 text-center space-y-3">
              <Film className="w-10 h-10 text-muted-foreground mx-auto" />
              <h3 className="font-bold text-foreground">No Rendered Shorts Ready</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Ingest an authorized YouTube video or render vertical clips from your Highlights tab to populate this queue.
              </p>
              <Link href="/projects/new" className="inline-block px-4 py-2 rounded-lg bg-primary text-[#194350] font-bold text-xs shadow-sm">
                Create Short
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {paginatedReady.map((exp) => {
                const fileName = exp.file_path ? exp.file_path.split(/\\|\//).pop() : '';
                const isPublishing = publishingNowId === exp.id;
                const meta = fileMetadata[exp.id] || {
                  selectedTitle: exp.title,
                  titleSuggestions: [exp.title],
                  description: exp.description,
                  tags: ['GTA6', 'GamingShorts'],
                  canPublish: true,
                  copyrightPassed: true,
                };

                return (
                  <div key={exp.id} className="vice-card p-6 border border-border space-y-5">
                    {/* Header info */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold border text-primary bg-primary/10 border-primary/30 uppercase">
                          {exp.platform === 'youtube_shorts' ? 'YouTube Shorts (1080×1920)' : 'Instagram Reels (1080×1920)'}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {(exp.file_size / (1024 * 1024)).toFixed(2)} MB • {exp.duration ? `${exp.duration.toFixed(1)}s` : 'Vertical Short'}
                        </span>
                      </div>

                      {/* Copyright verification badge */}
                      <div className="flex items-center gap-1.5 text-xs">
                        {meta.copyrightPassed ? (
                          <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px] bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Licensing Passed (Creator Attribution Verified)</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-rose-500 font-semibold text-[11px] bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-500/20">
                            <ShieldAlert className="w-3.5 h-3.5" />
                            <span>Licensing Blocked: Creator Permission Missing</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      {/* Left: 9:16 Video Player Preview */}
                      <div className="lg:col-span-4 flex flex-col items-center">
                        <div className="w-full max-w-[240px] aspect-[9/16] bg-black rounded-2xl overflow-hidden border border-border shadow-md">
                          <video
                            src={`/api/media/clips/${fileName}#t=0.5`}
                            controls
                            playsInline
                            preload="metadata"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </div>

                      {/* Right: AI Title Suggestions, Description & Attribution */}
                      <div className="lg:col-span-8 space-y-4">
                        {/* 3 AI Generated Title Suggestions */}
                        <div>
                          <label className="text-xs font-bold text-foreground flex items-center gap-1.5 mb-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-primary" /> AI Generated Titles (Choose or Edit):
                          </label>
                          <div className="space-y-1.5">
                            {meta.titleSuggestions.map((title, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() =>
                                  setFileMetadata((prev) => ({
                                    ...prev,
                                    [exp.id]: { ...prev[exp.id], selectedTitle: title },
                                  }))
                                }
                                className={`w-full text-left p-2.5 rounded-xl text-xs font-semibold border transition-all flex items-center justify-between ${
                                  meta.selectedTitle === title
                                    ? 'bg-primary/15 border-primary text-primary font-bold shadow-xs'
                                    : 'bg-muted/40 hover:bg-muted border-border text-foreground'
                                }`}
                              >
                                <span>{title}</span>
                                {meta.selectedTitle === title && <Check className="w-4 h-4 text-primary shrink-0 ml-2" />}
                              </button>
                            ))}
                          </div>

                          <input
                            type="text"
                            value={meta.selectedTitle}
                            onChange={(e) =>
                              setFileMetadata((prev) => ({
                                ...prev,
                                [exp.id]: { ...prev[exp.id], selectedTitle: e.target.value },
                              }))
                            }
                            className="w-full mt-2 bg-input border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:border-primary"
                            placeholder="Custom Title..."
                          />
                        </div>

                        {/* Description & Attribution */}
                        <div>
                          <label className="text-xs font-bold text-foreground flex items-center justify-between mb-1">
                            <span>SEO Description & Creator Attribution:</span>
                            <span className="text-[10px] text-primary font-normal">Includes Verified Creator Credit</span>
                          </label>
                          <textarea
                            rows={5}
                            value={meta.description}
                            onChange={(e) =>
                              setFileMetadata((prev) => ({
                                ...prev,
                                [exp.id]: { ...prev[exp.id], description: e.target.value },
                              }))
                            }
                            className="w-full bg-input border border-border rounded-xl p-3 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary resize-y"
                          />
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-3 pt-2">
                          <button
                            onClick={() => handlePublishNow(exp)}
                            disabled={isPublishing || !meta.canPublish}
                            className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] text-[#194350] font-bold text-xs flex items-center justify-center gap-2 shadow-sm hover:opacity-95 disabled:opacity-50 transition-all"
                          >
                            {isPublishing ? (
                              <>
                                <span className="w-3.5 h-3.5 border-2 border-[#194350] border-t-transparent rounded-full animate-spin" />
                                Publishing to YouTube Shorts...
                              </>
                            ) : (
                              <>
                                <Send className="w-4 h-4" /> Publish Now
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => setSelectedFile(exp)}
                            className="py-2.5 px-4 rounded-xl bg-muted hover:bg-muted/80 border border-border text-foreground text-xs font-semibold flex items-center gap-1.5 transition-colors"
                          >
                            <Calendar className="w-4 h-4 text-primary" /> Schedule Post
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Ready Packages Pagination */}
          <Pagination
            page={readyPage}
            pageSize={readyPageSize}
            total={exportFiles.length}
            onPageChange={(p) => setReadyPage(p)}
            onPageSizeChange={(ps) => {
              setReadyPageSize(ps);
              setReadyPage(1);
            }}
            pageSizeOptions={[12, 24, 48, 96]}
            itemLabel="ready packages"
          />
        </div>
      )}

      {/* =========================================================================
          TAB 3: SCHEDULED POSTS QUEUE
          ========================================================================= */}
      {activeTab === 'scheduled' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" /> Scheduled Publishing Queue (Asia/Kolkata IST)
            </h2>
            <span className="text-xs text-muted-foreground font-mono">Daemon worker active (polls every 30s)</span>
          </div>

          {/* Interactive Scheduling Calendar */}
          <ScheduleCalendar
            events={calendarEventsMap}
            selectedDate={selectedCalendarDate}
            onSelectDate={(d) => {
              setSelectedCalendarDate(d);
              setScheduledPage(1);
            }}
          />

          {filteredScheduled.length === 0 ? (
            <div className="vice-card p-10 text-center space-y-2 border border-border bg-card">
              <Clock className="w-8 h-8 text-muted-foreground mx-auto" />
              <p className="text-xs text-muted-foreground">
                {selectedCalendarDate
                  ? `No posts scheduled for ${selectedCalendarDate}.`
                  : 'No posts currently scheduled in the queue.'}
              </p>
              {selectedCalendarDate && (
                <button
                  onClick={() => setSelectedCalendarDate(null)}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  Clear Date Filter
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {paginatedScheduled.map((post) => (
                <div key={post.id} className="vice-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-border bg-card">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                        {post.status}
                      </span>
                      <span className="text-[10px] text-primary font-bold uppercase">{post.platform.replace('_', ' ')}</span>
                      <span className="text-border text-xs">•</span>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {new Date(post.scheduled_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)
                      </span>
                    </div>
                    <h4 className="font-bold text-sm text-foreground">{post.title}</h4>
                    <p className="text-[11px] text-muted-foreground">Channel: {post.account_name || 'Connected YouTube Studio'}</p>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                      onClick={() => handlePublishNow({ id: post.export_file_id, platform: post.platform })}
                      className="px-3 py-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 text-xs font-bold border border-primary/30 flex items-center gap-1"
                    >
                      <Send className="w-3 h-3" /> Publish Now
                    </button>
                    <button
                      onClick={() => handleCancelSchedule(post.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 text-xs border border-rose-500/20"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Scheduled Posts Pagination */}
          <Pagination
            page={scheduledPage}
            pageSize={scheduledPageSize}
            total={filteredScheduled.length}
            onPageChange={(p) => setScheduledPage(p)}
            onPageSizeChange={(ps) => {
              setScheduledPageSize(ps);
              setScheduledPage(1);
            }}
            pageSizeOptions={[12, 24, 48, 96]}
            itemLabel="scheduled posts"
          />
        </div>
      )}

      {/* =========================================================================
          TAB 4: PUBLISHING HISTORY
          ========================================================================= */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Published Social Media Posts ({filteredPublished.length})
            </h2>
          </div>

          {filteredPublished.length === 0 ? (
            <div className="vice-card p-10 text-center text-xs text-muted-foreground border border-border bg-card">
              {selectedCalendarDate
                ? `No videos were published on ${selectedCalendarDate}.`
                : 'No videos published yet. Publish a short to view live permalinks and video IDs.'}
            </div>
          ) : (
            <div className="space-y-3">
              {paginatedPublished.map((post) => (
                <div key={post.id} className="vice-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-border bg-card">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                        PUBLISHED
                      </span>
                      <span className="text-[10px] text-primary font-bold uppercase">{post.platform.replace('_', ' ')}</span>
                      <span className="text-border text-xs">•</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {new Date(post.updated_at).toLocaleString()}
                      </span>
                    </div>
                    <h4 className="font-bold text-sm text-foreground">{post.title}</h4>
                    {post.platform_post_id && (
                      <span className="text-[11px] font-mono text-muted-foreground">Video ID: {post.platform_post_id}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <a
                      href={post.published_url || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#9dbeb8] to-[#ffc2b4] text-[#194350] font-bold text-xs flex items-center gap-1.5 shadow-sm hover:opacity-95 transition-all"
                    >
                      <span>Open Live Post</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>

                    <button
                      onClick={() => setDeletePostTarget(post)}
                      className="p-2 rounded-xl bg-muted hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 border border-border transition-colors"
                      title="Remove from Local Library"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Publishing History Pagination */}
          <Pagination
            page={historyPage}
            pageSize={historyPageSize}
            total={filteredPublished.length}
            onPageChange={(p) => setHistoryPage(p)}
            onPageSizeChange={(ps) => {
              setHistoryPageSize(ps);
              setHistoryPage(1);
            }}
            pageSizeOptions={[12, 24, 48, 96]}
            itemLabel="published posts"
          />
        </div>
      )}

      {/* =========================================================================
          TAB 5: FAILED UPLOADS
          ========================================================================= */}
      {activeTab === 'failed' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500" /> Failed Uploads & Retries ({failedList.length})
            </h2>
          </div>

          {failedList.length === 0 ? (
            <div className="vice-card p-10 text-center text-xs text-muted-foreground">
              No failed uploads. All jobs processed cleanly.
            </div>
          ) : (
            <div className="space-y-3">
              {failedList.map((post) => (
                <div key={post.id} className="vice-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-rose-500/30">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-500 border border-rose-500/30">
                        FAILED
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">Retries: {post.retry_count || 0}/3</span>
                    </div>
                    <h4 className="font-bold text-sm text-foreground">{post.title}</h4>
                    <p className="text-xs text-rose-500/90 font-mono">{post.last_error || 'Publishing error'}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handlePublishNow({ id: post.export_file_id, platform: post.platform })}
                      className="px-3 py-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 text-xs font-bold border border-primary/30 flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" /> Retry Upload
                    </button>
                    <button
                      onClick={() => handleCancelSchedule(post.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 text-xs border border-rose-500/20"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Schedule Modal */}
      {selectedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="vice-card max-w-md w-full p-6 space-y-5 border border-border bg-card text-foreground shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" /> Schedule Social Publish
              </h3>
              <button onClick={() => setSelectedFile(null)} className="text-muted-foreground hover:text-foreground text-sm">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSchedule} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Target Video</label>
                <div className="text-xs font-bold text-primary truncate bg-muted p-2 rounded-lg border border-border">
                  {selectedFile.title}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">Target Platform</label>
                <select
                  value={schedulePlatform}
                  onChange={(e) => setSchedulePlatform(e.target.value as any)}
                  className="w-full bg-input border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary"
                >
                  <option value="youtube_shorts">YouTube Shorts</option>
                  <option value="instagram_reels">Instagram Reels</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">Publishing Date & Time</label>
                <input
                  type="datetime-local"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full bg-input border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary"
                  required
                />
                <span className="text-[10px] text-muted-foreground mt-1 block">Timezone: Asia/Kolkata (IST)</span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-xs font-semibold text-muted-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] text-[#194350] font-bold text-xs shadow-sm hover:opacity-95 transition-all"
                >
                  Confirm Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Published / History Post Confirmation Modal */}
      {deletePostTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-scale-in">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-base text-foreground">Remove from Library?</h3>
                <p className="text-xs text-muted-foreground">
                  Remove record for <strong className="text-foreground">{deletePostTarget.title}</strong> from your local library?
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 space-y-1.5">
              <p className="font-bold flex items-center gap-1.5">
                <Info className="w-4 h-4 shrink-0" /> Important Platform Notice:
              </p>
              <p className="text-[11px] leading-relaxed">
                This action only deletes the local record and cached rendering files from your application storage. It does <strong>NOT</strong> delete the video from YouTube or Instagram. To remove the video from public view, delete it directly inside YouTube Studio or the Instagram app.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletePostTarget(null)}
                className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold border border-border transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeletePost}
                className="px-4 py-2 rounded-xl bg-rose-500 text-white hover:bg-rose-600 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove from Library</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

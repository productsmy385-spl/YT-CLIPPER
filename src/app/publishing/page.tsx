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
  Play,
  Settings,
  Lock,
  Globe,
  Eye,
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
  const [scheduleTimezone, setScheduleTimezone] = useState('Asia/Kolkata');

  // Publish Now interactive modal state
  const [publishModalFile, setPublishModalFile] = useState<any | null>(null);
  const [publishTitle, setPublishTitle] = useState('');
  const [publishDescription, setPublishDescription] = useState('');
  const [publishTags, setPublishTags] = useState('GTA6, GamingShorts, ViceCity, ViralShorts');
  const [publishPrivacy, setPublishPrivacy] = useState<'public' | 'unlisted' | 'private'>('public');
  const [isUploadingNow, setIsUploadingNow] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [testingConnection, setTestingConnection] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Delete post modal state
  const [deletePostTarget, setDeletePostTarget] = useState<any | null>(null);

  // Check URL parameters for OAuth redirect callbacks
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const connected = params.get('connected');
      const channel = params.get('channel');
      const error = params.get('error');

      if (connected === 'youtube') {
        setStatusMessage({
          type: 'success',
          text: `✓ YouTube Channel Successfully Connected: "${decodeURIComponent(channel || 'Verified Channel')}"! Real-time publishing and scheduling are now enabled.`,
        });
        setActiveTab('accounts');
      } else if (error) {
        setStatusMessage({
          type: 'error',
          text: decodeURIComponent(error),
        });
      }
    } catch { }
  }, []);

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
          } catch { }
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

  const handleConnectYouTube = () => {
    window.location.href = '/api/youtube/connect';
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setStatusMessage({ type: 'info', text: 'Testing YouTube Data API connection & upload permissions...' });
    try {
      const res = await fetch('/api/youtube/test', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: 'success',
          text: data.message || '✓ YouTube connection verified! Channel access and video upload permissions are active.',
        });
        await loadData();
      } else {
        setStatusMessage({
          type: 'error',
          text: `Connection test failed: ${data.error || 'Token may be expired. Click Reconnect YouTube.'}`,
        });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Test error: ${err.message}` });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleDisconnectYouTube = async () => {
    if (!confirm('Are you sure you want to disconnect your YouTube channel?')) return;
    try {
      await fetch('/api/youtube/disconnect', { method: 'POST' });
      setStatusMessage({ type: 'info', text: 'YouTube channel disconnected and stored tokens revoked.' });
      loadData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  const openPublishModal = (exp: any) => {
    const meta = fileMetadata[exp.id];
    setPublishModalFile(exp);
    setPublishTitle(meta?.selectedTitle || exp.title || 'GTA 6 Gameplay Viral Short');
    setPublishDescription(meta?.description || 'High-octane GTA 6 gameplay moment edited with certified meme sound effects.\n\n#GTA6 #Gaming #Shorts #ViceCity');
    setPublishTags(meta?.tags?.join(', ') || 'GTA6, Gaming, Shorts, ViceCity');
    setPublishPrivacy('public');
    setUploadProgress(0);
  };

  const handleExecutePublishNow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publishModalFile) return;

    if (!isYtConnected) {
      setStatusMessage({
        type: 'error',
        text: 'Cannot publish: Your YouTube channel is not connected. Please click "Connect YouTube Channel" first.',
      });
      return;
    }

    setIsUploadingNow(true);
    setUploadProgress(20);

    try {
      const res = await fetch('/api/publishing/publish-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exportFileId: publishModalFile.id,
          platform: 'youtube_shorts',
          title: publishTitle.trim(),
          description: publishDescription.trim(),
          tags: publishTags.split(',').map((t) => t.trim()),
          privacyStatus: publishPrivacy,
        }),
      });

      setUploadProgress(80);
      const data = await res.json();

      if (data.success) {
        setUploadProgress(100);
        setStatusMessage({
          type: 'success',
          text: `✓ Successfully published Short to YouTube! Live Link: ${data.publishedUrl}`,
        });
        setPublishModalFile(null);
        setActiveTab('history');
        loadData();
      } else {
        setStatusMessage({
          type: 'error',
          text: `Publishing failed: ${data.error || 'Failed to upload video to YouTube Data API.'}`,
        });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Upload error: ${err.message}` });
    } finally {
      setIsUploadingNow(false);
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
          timezone: scheduleTimezone,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: 'success',
          text: `✓ Post successfully scheduled for ${new Date(scheduleDate).toLocaleString()} (${scheduleTimezone})`,
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

  const handleRetryFailedPost = async (id: string) => {
    setStatusMessage({ type: 'info', text: 'Retrying upload for failed post...' });
    try {
      const res = await fetch(`/api/publishing/schedule/${id}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({ type: 'success', text: `✓ Retry succeeded! Published: ${data.publishedUrl}` });
        loadData();
      } else {
        setStatusMessage({ type: 'error', text: `Retry failed: ${data.error}` });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Retry error: ${err.message}` });
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

  const filteredPublished = publishedList.filter((p) => {
    if (selectedCalendarDate) {
      return (p.scheduled_at || p.created_at)?.substring(0, 10) === selectedCalendarDate;
    }
    return true;
  });

  const paginatedReady = exportFiles.slice((readyPage - 1) * readyPageSize, readyPage * readyPageSize);
  const paginatedScheduled = filteredScheduled.slice((scheduledPage - 1) * scheduledPageSize, scheduledPage * scheduledPageSize);
  const paginatedPublished = filteredPublished.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize);

  // YouTube state evaluation matching official 9 states
  const ytState = youtubeAccount?.state || (youtubeAccount?.connected ? 'CONNECTED' : 'NOT_CONNECTED');
  const isYtConnected = ytState === 'CONNECTED';
  const isYtExpired = ytState === 'TOKEN_EXPIRED' || ytState === 'REAUTH_REQUIRED';
  const isYtPermissionMissing = ytState === 'PERMISSION_MISSING';
  const isYtError = ytState === 'CONNECTION_ERROR';

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-foreground">Publishing & Channel Center</h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
              OAUTH 2.0 INTEGRATION
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Connect your official YouTube channel via Google OAuth, publish 1080×1920 Shorts, and schedule automatic uploads with background daemons.
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
          className={`p-4 rounded-xl border text-xs font-semibold flex items-center justify-between animate-fade-in ${statusMessage.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
            : statusMessage.type === 'info'
              ? 'bg-sky-500/10 border-sky-500/30 text-sky-700 dark:text-sky-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
            }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : statusMessage.type === 'info' ? (
              <Info className="w-4 h-4 shrink-0 animate-pulse" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-xs hover:underline ml-4 shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {/* 5 Clean Production Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-3 overflow-x-auto text-xs font-bold">
        <button
          onClick={() => setActiveTab('accounts')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${activeTab === 'accounts'
            ? 'bg-primary text-[#194350] shadow-sm font-bold'
            : 'text-muted-foreground hover:text-foreground'
            }`}
        >
          <Youtube className="w-3.5 h-3.5" />
          <span>Connected Channels</span>
        </button>
        <button
          onClick={() => setActiveTab('ready')}
          className={`px-4 py-2 rounded-xl transition-all ${activeTab === 'ready'
            ? 'bg-primary text-[#194350] shadow-sm font-bold'
            : 'text-muted-foreground hover:text-foreground'
            }`}
        >
          Ready to Publish ({exportFiles.length})
        </button>
        <button
          onClick={() => setActiveTab('scheduled')}
          className={`px-4 py-2 rounded-xl transition-all ${activeTab === 'scheduled'
            ? 'bg-primary text-[#194350] shadow-sm font-bold'
            : 'text-muted-foreground hover:text-foreground'
            }`}
        >
          Scheduled Posts ({activeScheduled.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-xl transition-all ${activeTab === 'history'
            ? 'bg-secondary text-[#0c1b21] shadow-sm font-bold'
            : 'text-muted-foreground hover:text-foreground'
            }`}
        >
          Published Shorts ({publishedList.length})
        </button>
        <button
          onClick={() => setActiveTab('failed')}
          className={`px-4 py-2 rounded-xl transition-all ${activeTab === 'failed'
            ? 'bg-rose-500/20 text-rose-500 border border-rose-500/30 shadow-sm font-bold'
            : 'text-muted-foreground hover:text-foreground'
            }`}
        >
          Failed Uploads ({failedList.length})
        </button>
      </div>

      {/* =========================================================================
          TAB 1: CONNECTED ACCOUNTS & SETTINGS
          ========================================================================= */}
      {activeTab === 'accounts' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Real YouTube Account Card */}
            <div className="vice-card p-6 space-y-4 border border-border">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 overflow-hidden shrink-0">
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
                      {youtubeAccount?.channel?.customUrl || (youtubeAccount?.channel?.id ? `ID: ${youtubeAccount.channel.id}` : 'Google OAuth 2.0')}
                    </p>
                  </div>
                </div>

                {/* State Badge matching 9 official states */}
                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wide ${isYtConnected
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                    : isYtExpired
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                      : isYtPermissionMissing || isYtError
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
                        : 'bg-muted text-muted-foreground border-border'
                    }`}
                >
                  {ytState.replace('_', ' ')}
                </span>
              </div>

              {/* Channel Metrics & Account Details */}
              <div className="space-y-2 text-xs bg-muted/50 p-3.5 rounded-xl border border-border">
                {youtubeAccount?.channel?.id && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Channel ID:</span>
                    <span className="font-mono text-foreground font-semibold text-[11px] truncate max-w-[200px]">
                      {youtubeAccount.channel.id}
                    </span>
                  </div>
                )}
                {youtubeAccount?.channel?.email && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Google Account:</span>
                    <span className="font-semibold text-foreground truncate max-w-[200px]">
                      {youtubeAccount.channel.email}
                    </span>
                  </div>
                )}
                {youtubeAccount?.channel?.subscribers && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Subscribers:</span>
                    <span className="font-bold text-foreground">{youtubeAccount.channel.subscribers}</span>
                  </div>
                )}
                {youtubeAccount?.channel?.videos && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Uploaded Videos:</span>
                    <span className="font-bold text-foreground">{youtubeAccount.channel.videos}</span>
                  </div>
                )}

                {/* Permissions Breakdown */}
                <div className="pt-2 border-t border-border/80 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-500" /> Video Upload Permission:
                    </span>
                    <span className={youtubeAccount?.canUpload ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-rose-500 font-bold'}>
                      {youtubeAccount?.canUpload ? 'Granted' : 'Missing Scope'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3 text-emerald-500" /> Scheduled Publishing (Offline):
                    </span>
                    <span className={youtubeAccount?.canSchedule ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-amber-500 font-bold'}>
                      {youtubeAccount?.canSchedule ? 'Active Daemon' : 'Requires Reauth'}
                    </span>
                  </div>
                </div>

                {isYtExpired && (
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-[11px] mt-2">
                    Google OAuth token expired or revoked. Click <strong>Reconnect YouTube</strong> to authorize via Google Sign-In.
                  </div>
                )}

                {isYtError && youtubeAccount?.error && (
                  <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-[11px] mt-2">
                    {youtubeAccount.error}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
                {!isYtConnected ? (
                  <button
                    onClick={handleConnectYouTube}
                    className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] text-[#194350] font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm hover:opacity-95"
                  >
                    <Youtube className="w-3.5 h-3.5" /> Connect YouTube Channel
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleTestConnection}
                      disabled={testingConnection}
                      className="py-2 px-3 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold border border-border flex items-center gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${testingConnection ? 'animate-spin' : ''}`} />
                      <span>Test Connection</span>
                    </button>
                    <button
                      onClick={handleConnectYouTube}
                      className="py-2 px-3 rounded-xl bg-primary/20 text-primary hover:bg-primary/30 text-xs font-semibold border border-primary/30"
                    >
                      Reconnect
                    </button>
                    <button
                      onClick={handleDisconnectYouTube}
                      className="py-2 px-3 rounded-xl bg-muted hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 text-xs font-semibold border border-border"
                    >
                      Disconnect
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Instagram Reels Account Card */}
            <div className="vice-card p-6 space-y-4 border border-border">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-pink-500/10 border border-pink-500/30 flex items-center justify-center text-pink-500 overflow-hidden shrink-0">
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
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase ${instagramAccount?.connected
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                    : 'bg-muted text-muted-foreground border-border'
                    }`}
                >
                  {instagramAccount?.connected ? 'CONNECTED' : 'NOT CONNECTED'}
                </span>
              </div>

              <div className="space-y-2 text-xs bg-muted/50 p-3.5 rounded-xl border border-border">
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
                    To connect Instagram Reels, set <code className="text-primary font-mono">INSTAGRAM_ACCESS_TOKEN</code> in your environment variables.
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
                Ingest an authorized video or render vertical clips from your Highlights tab to populate this queue.
              </p>
              <Link href="/projects/new" className="inline-block px-4 py-2 rounded-lg bg-primary text-[#194350] font-bold text-xs shadow-sm">
                Create Short
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {paginatedReady.map((exp) => {
                const fileName = exp.file_path ? exp.file_path.split(/\\|\//).pop() : '';
                const meta = fileMetadata[exp.id] || {
                  selectedTitle: exp.title,
                  description: exp.description || '',
                  tags: ['GTA6', 'Shorts'],
                };

                return (
                  <div key={exp.id} className="vice-card p-6 space-y-4 border border-border">
                    <div className="flex flex-col lg:flex-row gap-6">
                      {/* Video Preview Column */}
                      <div className="w-full lg:w-48 shrink-0 flex flex-col items-center">
                        <div className="relative aspect-[9/16] w-36 bg-black rounded-xl overflow-hidden shadow-lg border border-border flex items-center justify-center">
                          {exp.finalPreviewUrl ? (
                            <video
                              src={exp.finalPreviewUrl}
                              controls
                              playsInline
                              preload="metadata"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="text-center p-3">
                              <Film className="w-8 h-8 text-muted-foreground mx-auto mb-1" />
                              <span className="text-[10px] text-muted-foreground">1080×1920 Short</span>
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono mt-2 truncate max-w-[150px]">
                          {fileName}
                        </span>
                      </div>

                      {/* Metadata Editor Column */}
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 uppercase">
                            {exp.platform === 'youtube_shorts' ? 'YouTube Shorts (1080×1920)' : 'Instagram Reels (9:16)'}
                          </span>
                          <span className="text-xs text-muted-foreground font-mono">{exp.duration?.toFixed(1)}s</span>
                        </div>

                        <div>
                          <label className="text-xs font-bold text-foreground block mb-1">Optimized Title</label>
                          <input
                            type="text"
                            value={meta.selectedTitle || exp.title}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFileMetadata((prev) => ({
                                ...prev,
                                [exp.id]: { ...prev[exp.id], selectedTitle: val },
                              }));
                            }}
                            className="w-full bg-input border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-bold text-foreground block mb-1">Description & Hashtags</label>
                          <textarea
                            rows={3}
                            value={meta.description}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFileMetadata((prev) => ({
                                ...prev,
                                [exp.id]: { ...prev[exp.id], description: val },
                              }));
                            }}
                            className="w-full bg-input border border-border rounded-xl p-3 text-xs text-foreground focus:outline-none focus:border-primary resize-none"
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-3 pt-2">
                          <button
                            onClick={() => openPublishModal(exp)}
                            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] text-[#194350] font-bold text-xs flex items-center gap-1.5 shadow-sm hover:opacity-95 transition-all"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Publish to YouTube</span>
                          </button>

                          <button
                            onClick={() => {
                              setSelectedFile(exp);
                              setSchedulePlatform('youtube_shorts');
                            }}
                            className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-semibold text-xs border border-border flex items-center gap-1.5 transition-colors"
                          >
                            <Calendar className="w-3.5 h-3.5 text-primary" />
                            <span>Add Schedule</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

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
                itemLabel="ready videos"
              />
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 3: SCHEDULED POSTS
          ========================================================================= */}
      {activeTab === 'scheduled' && (
        <div className="space-y-6">
          <div className="vice-card p-6 border border-border">
            <ScheduleCalendar
              events={calendarEventsMap}
              selectedDate={selectedCalendarDate}
              onSelectDate={(d) => setSelectedCalendarDate(d)}
            />
          </div>

          <div className="space-y-4">
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <span>Active Scheduled Posts ({filteredScheduled.length})</span>
            </h2>

            {filteredScheduled.length === 0 ? (
              <div className="vice-card p-8 text-center text-xs text-muted-foreground">
                No scheduled posts matching this filter.
              </div>
            ) : (
              <div className="space-y-3">
                {paginatedScheduled.map((post) => (
                  <div key={post.id} className="vice-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-border">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 uppercase">
                          {post.platform.replace('_', ' ')}
                        </span>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3 text-primary" />
                          {new Date(post.scheduled_at).toLocaleString()} ({post.timezone || 'Asia/Kolkata'})
                        </span>
                      </div>
                      <h4 className="font-bold text-sm text-foreground">{post.title || 'GTA 6 Short'}</h4>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCancelSchedule(post.id)}
                        className="px-3 py-1.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors"
                      >
                        Cancel Schedule
                      </button>
                    </div>
                  </div>
                ))}

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
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: PUBLISHED SHORTS (HISTORY)
          ========================================================================= */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Published Shorts History ({filteredPublished.length})
          </h2>

          {filteredPublished.length === 0 ? (
            <div className="vice-card p-8 text-center text-xs text-muted-foreground">
              No videos published yet. Publish from the Ready to Publish tab to see live YouTube links here.
            </div>
          ) : (
            <div className="space-y-3">
              {paginatedPublished.map((post) => (
                <div key={post.id} className="vice-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-border">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 uppercase">
                        PUBLISHED
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(post.updated_at || post.created_at).toLocaleString()}
                      </span>
                    </div>
                    <h4 className="font-bold text-sm text-foreground">{post.title || 'GTA 6 Short'}</h4>
                    {post.published_url && (
                      <p className="text-xs text-primary font-mono truncate max-w-md">
                        {post.published_url}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {post.published_url && (
                      <a
                        href={post.published_url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#9dbeb8] to-[#ffc2b4] text-[#194350] font-bold text-xs flex items-center gap-1.5 shadow-sm hover:opacity-95 transition-all"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Watch on YouTube</span>
                      </a>
                    )}
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
        </div>
      )}

      {/* =========================================================================
          TAB 5: FAILED UPLOADS
          ========================================================================= */}
      {activeTab === 'failed' && (
        <div className="space-y-4">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500" /> Failed Uploads & Retries ({failedList.length})
          </h2>

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
                      onClick={() => handleRetryFailedPost(post.id)}
                      className="px-3.5 py-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 text-xs font-bold border border-primary/30 flex items-center gap-1"
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

      {/* =========================================================================
          PUBLISH NOW INTERACTIVE DIALOG MODAL
          ========================================================================= */}
      {publishModalFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="vice-card max-w-lg w-full p-6 space-y-5 border border-border bg-card text-foreground shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2 text-primary">
                <Youtube className="w-5 h-5 text-red-500" />
                <h3 className="font-bold text-base text-foreground">Publish to YouTube Shorts</h3>
              </div>
              <button
                disabled={isUploadingNow}
                onClick={() => setPublishModalFile(null)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleExecutePublishNow} className="space-y-4">
              {/* Connected Channel Indicator */}
              <div className="p-3 rounded-xl bg-muted/60 border border-border flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-muted-foreground">Connected Channel:</span>
                  <span className="font-bold text-foreground">{youtubeAccount?.channel?.title || 'YouTube Creator Channel'}</span>
                </div>
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/30">
                  Data API v3
                </span>
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">Short Title (max 100 chars)</label>
                <input
                  type="text"
                  maxLength={100}
                  value={publishTitle}
                  onChange={(e) => setPublishTitle(e.target.value)}
                  className="w-full bg-input border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">Description & Hashtags</label>
                <textarea
                  rows={4}
                  value={publishDescription}
                  onChange={(e) => setPublishDescription(e.target.value)}
                  className="w-full bg-input border border-border rounded-xl p-3 text-xs text-foreground focus:outline-none focus:border-primary resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={publishTags}
                  onChange={(e) => setPublishTags(e.target.value)}
                  className="w-full bg-input border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">Privacy Status</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['public', 'unlisted', 'private'] as const).map((priv) => (
                    <button
                      key={priv}
                      type="button"
                      onClick={() => setPublishPrivacy(priv)}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold capitalize flex items-center justify-center gap-1.5 transition-all ${publishPrivacy === priv
                        ? 'border-primary bg-primary/15 text-primary font-bold'
                        : 'border-border bg-muted text-muted-foreground hover:text-foreground'
                        }`}
                    >
                      {priv === 'public' ? <Globe className="w-3.5 h-3.5" /> : priv === 'unlisted' ? <Eye className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                      <span>{priv}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Upload Progress Bar */}
              {isUploadingNow && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="flex items-center gap-1 text-primary">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Uploading Video to YouTube...
                    </span>
                    <span className="font-mono">{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden border border-border">
                    <div
                      className="h-full bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  disabled={isUploadingNow}
                  onClick={() => setPublishModalFile(null)}
                  className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-xs font-semibold text-muted-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploadingNow}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] text-[#194350] font-bold text-xs shadow-sm hover:opacity-95 transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isUploadingNow ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Publishing...
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" /> Publish Now
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
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
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">Timezone</label>
                <select
                  value={scheduleTimezone}
                  onChange={(e) => setScheduleTimezone(e.target.value)}
                  className="w-full bg-input border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST - UTC+5:30)</option>
                  <option value="America/New_York">America/New_York (EST - UTC-5)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (PST - UTC-8)</option>
                  <option value="UTC">UTC (Universal Time)</option>
                </select>
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
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Youtube,
  Upload,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Clock,
  Sparkles,
  Lock,
  Globe,
  Eye,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

export interface PublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  clip: {
    id: string;
    title: string;
    duration?: number;
    resolution?: string;
    previewUrl?: string;
    filePath?: string;
    exportFileId?: string;
    projectId?: string;
    isPublished?: boolean;
    publishedUrl?: string;
  } | null;
  onSuccess?: (result: any) => void;
}

export function PublishModal({ isOpen, onClose, clip, onSuccess }: PublishModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('GTA6, GamingShorts, ViceCity, ViralShorts');
  const [privacy, setPrivacy] = useState<'public' | 'unlisted' | 'private'>('public');
  const [confirmed, setConfirmed] = useState(false);

  // YouTube Channel state
  const [ytStatus, setYtStatus] = useState<any>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStep, setUploadStep] = useState<string>('');
  const [uploadResult, setUploadResult] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset and pre-fill when clip opens
  useEffect(() => {
    if (clip && isOpen) {
      setTitle(clip.title.endsWith('#shorts') ? clip.title : `${clip.title} 🏎️💨 #shorts #gta6`);
      setDescription(
        `Crazy GTA 6 Vice City stunt & gameplay highlight! Edited automatically with AI Studio.\n\nSubscribe for daily GTA 6 Shorts!\n\n#GTA6 #GrandTheftAuto #GamingShorts #ViceCity`
      );
      setTags('GTA6, GamingShorts, ViceCity, ViralShorts, GameplayHighlights');
      setPrivacy('public');
      setConfirmed(false);
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStep('');
      setUploadResult(null);
      setErrorMessage(null);
      checkYouTubeStatus();
    }
  }, [clip, isOpen]);

  const checkYouTubeStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch('/api/youtube/status');
      const data = await res.json();
      setYtStatus(data.report || data);
    } catch {
      setYtStatus(null);
    } finally {
      setLoadingStatus(false);
    }
  };

  if (!isOpen || !clip) return null;

  const isConnected = ytStatus?.connected && ytStatus?.state !== 'TOKEN_EXPIRED';
  const channel = ytStatus?.channel;

  const handlePublish = async () => {
    if (!confirmed) {
      setErrorMessage('Please confirm you are ready to publish this video.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(15);
    setUploadStep('Verifying YouTube OAuth credentials & channel permissions...');
    setErrorMessage(null);

    try {
      // Simulate progress progression during upload session
      const progressTimer = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) return prev;
          if (prev < 40) return prev + 15;
          if (prev < 75) return prev + 10;
          return prev + 5;
        });
      }, 700);

      setUploadStep('Uploading 1080x1920 MP4 payload via YouTube Data API v3 Resumable Upload...');

      const res = await fetch('/api/publishing/publish-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipId: clip.id,
          exportFileId: clip.exportFileId,
          platform: 'youtube_shorts',
          title: title.trim(),
          description: description.trim(),
          tags,
          privacyStatus: privacy,
        }),
      });

      clearInterval(progressTimer);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'YouTube upload failed');
      }

      setUploadProgress(100);
      setUploadStep('✓ Published successfully to YouTube!');
      setUploadResult(data);
      if (onSuccess) onSuccess(data);
    } catch (err: any) {
      setIsUploading(false);
      setErrorMessage(err.message || 'Failed to publish video');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-500/15 text-rose-500 flex items-center justify-center font-bold">
              <Youtube className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-foreground flex items-center gap-2">
                Publish Video to YouTube Shorts
              </h3>
              <p className="text-xs text-muted-foreground">
                One-click direct upload to your verified YouTube channel
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* YouTube Connection Status Banner */}
          <div className="rounded-xl border p-3 text-xs space-y-2">
            {loadingStatus ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Checking YouTube connectivity...
              </div>
            ) : isConnected ? (
              <div className="flex items-center justify-between gap-3 bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl">
                <div className="flex items-center gap-3">
                  {channel?.thumbnailUrl ? (
                    <img
                      src={channel.thumbnailUrl}
                      alt={channel.title}
                      className="w-10 h-10 rounded-full border border-emerald-500/30 object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-600 flex items-center justify-center font-bold text-sm">
                      YT
                    </div>
                  )}
                  <div>
                    <div className="font-bold text-foreground text-sm flex items-center gap-1.5">
                      {channel?.title || 'Connected YouTube Channel'}
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                        CONNECTED
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono">
                      ID: {channel?.id || 'verified'} &bull; Upload Permissions: Active
                    </div>
                  </div>
                </div>
                <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4" /> Ready to upload
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/25 p-3 rounded-xl">
                <div className="flex items-center gap-2.5 text-amber-700 dark:text-amber-400">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <div>
                    <div className="font-bold">YouTube channel not connected.</div>
                    <p className="text-[11px] text-muted-foreground">
                      Connect your Google/YouTube account to upload Shorts directly.
                    </p>
                  </div>
                </div>
                <a
                  href="/api/youtube/connect"
                  className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors shrink-0"
                >
                  <Youtube className="w-3.5 h-3.5" /> Connect YouTube
                </a>
              </div>
            )}
          </div>

          {/* Success Screen */}
          {uploadResult ? (
            <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-extrabold text-foreground">
                  Published Successfully to YouTube!
                </h4>
                <p className="text-xs text-muted-foreground">
                  Your Short has been processed and uploaded via official YouTube Data API.
                </p>
              </div>

              {uploadResult.publishedUrl && (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                  <a
                    href={uploadResult.publishedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-primary text-[#194350] font-bold text-xs flex items-center justify-center gap-2 shadow-md hover:opacity-95"
                  >
                    <ExternalLink className="w-4 h-4" /> View on YouTube
                  </a>
                  {uploadResult.studioUrl && (
                    <a
                      href={uploadResult.studioUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-border bg-card hover:bg-muted font-bold text-xs text-foreground flex items-center justify-center gap-2"
                    >
                      Open in YouTube Studio
                    </a>
                  )}
                </div>
              )}

              <button
                onClick={onClose}
                className="mt-4 px-6 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-semibold text-xs"
              >
                Close Window
              </button>
            </div>
          ) : isUploading ? (
            /* Uploading Progress Screen */
            <div className="p-8 rounded-2xl bg-muted/40 border border-border text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center mx-auto animate-pulse">
                <Upload className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="font-extrabold text-base text-foreground">
                  Uploading to YouTube Shorts...
                </h4>
                <p className="text-xs text-muted-foreground">{uploadStep}</p>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-muted rounded-full h-3 overflow-hidden border border-border">
                <div
                  className="bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] h-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <div className="text-xs font-mono font-bold text-primary">{uploadProgress}% Complete</div>
            </div>
          ) : (
            /* Publishing Configuration Form */
            <div className="space-y-4">
              {/* Video Preview Card */}
              <div className="flex items-center gap-4 p-3 bg-muted/40 rounded-xl border border-border">
                <div className="w-20 h-24 bg-black rounded-lg overflow-hidden flex items-center justify-center shrink-0 border border-border">
                  {clip.previewUrl ? (
                    <video
                      src={clip.previewUrl}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                    />
                  ) : (
                    <Youtube className="w-6 h-6 text-muted-foreground opacity-50" />
                  )}
                </div>
                <div className="space-y-1 min-w-0 flex-1 text-xs">
                  <div className="font-bold text-foreground truncate">{clip.title}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    Duration: {clip.duration ? `${clip.duration.toFixed(1)}s` : 'Vertical Short'} &bull; Resolution: 1080x1920
                  </div>
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Formatted for 9:16 Shorts feed with dynamic subtitles & SFX
                  </div>
                </div>
              </div>

              {/* Video Title */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground flex items-center justify-between">
                  <span>Video Title</span>
                  <span className="text-[10px] text-muted-foreground font-mono">{title.length}/100</span>
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-card border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                  placeholder="Enter punchy viral title for YouTube Shorts..."
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground">Description &amp; Credits</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-card border border-border text-foreground text-xs focus:outline-none focus:border-primary resize-none"
                  placeholder="Video description, channel credits, and hashtags..."
                />
              </div>

              {/* Hashtags & Privacy Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-foreground">Hashtags &amp; Tags</label>
                  <input
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-card border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                    placeholder="gta6, shorts, gaming, vicecity"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-foreground">Privacy Visibility</label>
                  <select
                    value={privacy}
                    onChange={(e: any) => setPrivacy(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-card border border-border text-foreground text-xs focus:outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="public">🌐 Public (Immediate Global Reach)</option>
                    <option value="unlisted">🔗 Unlisted (Shareable Link Only)</option>
                    <option value="private">🔒 Private (Only Channel Owner)</option>
                  </select>
                </div>
              </div>

              {/* Confirmation Checkbox */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/30 border border-border cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 rounded border-border text-primary focus:ring-0 cursor-pointer"
                />
                <span className="text-muted-foreground select-none">
                  I confirm this edited video is ready for immediate publishing to YouTube Shorts under my connected channel.
                </span>
              </label>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-500 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!uploadResult && !isUploading && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/20">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-xs font-semibold"
            >
              Cancel
            </button>

            <button
              onClick={handlePublish}
              disabled={!isConnected || !confirmed || !title.trim()}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] text-[#194350] font-extrabold text-xs flex items-center gap-2 shadow-md hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Youtube className="w-4 h-4" /> Publish Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

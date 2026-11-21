'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Youtube,
  Globe,
  Sparkles,
} from 'lucide-react';

export interface ScheduleModalProps {
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
  } | null;
  existingSchedule?: {
    id: string;
    scheduledAt: string;
    timezone?: string;
  } | null;
  onSuccess?: (post: any) => void;
}

export function ScheduleModal({ isOpen, onClose, clip, existingSchedule, onSuccess }: ScheduleModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('18:00');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successPost, setSuccessPost] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // YouTube status
  const [ytStatus, setYtStatus] = useState<any>(null);

  useEffect(() => {
    if (clip && isOpen) {
      setTitle(clip.title.endsWith('#shorts') ? clip.title : `${clip.title} #shorts`);
      setDescription(`GTA 6 Vice City action highlight! Subscribe for daily gameplay shorts!\n\n#GTA6 #Gaming #Shorts`);

      if (existingSchedule?.scheduledAt) {
        const d = new Date(existingSchedule.scheduledAt);
        setScheduledDate(d.toISOString().split('T')[0]);
        setScheduledTime(d.toTimeString().slice(0, 5));
        if (existingSchedule.timezone) setTimezone(existingSchedule.timezone);
      } else {
        // Default to tomorrow 6:00 PM IST
        const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
        setScheduledDate(tomorrow.toISOString().split('T')[0]);
        setScheduledTime('18:00');
        setTimezone('Asia/Kolkata');
      }

      setIsSubmitting(false);
      setSuccessPost(null);
      setErrorMessage(null);

      fetch('/api/youtube/status')
        .then((res) => res.json())
        .then((data) => setYtStatus(data.report || data))
        .catch(() => setYtStatus(null));
    }
  }, [clip, existingSchedule, isOpen]);

  if (!isOpen || !clip) return null;

  const channel = ytStatus?.channel;

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduledDate || !scheduledTime) {
      setErrorMessage('Please select a valid publication date and time.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // Build ISO timestamp in the specified timezone
      const combinedDateTimeIso = `${scheduledDate}T${scheduledTime}:00`;
      const dateObj = new Date(combinedDateTimeIso);

      const res = await fetch('/api/publishing/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipId: clip.id,
          exportFileId: clip.exportFileId,
          postId: existingSchedule?.id,
          platform: 'youtube_shorts',
          scheduledAt: dateObj.toISOString(),
          timezone,
          title: title.trim(),
          description: description.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to schedule publication.');
      }

      setSuccessPost(data.post || data);
      if (onSuccess) onSuccess(data.post || data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Scheduling failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center font-bold">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-foreground">
                {existingSchedule ? 'Edit Scheduled Short' : 'Schedule YouTube Short'}
              </h3>
              <p className="text-xs text-muted-foreground">
                Automated publishing via persistent background queue
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {successPost ? (
            <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-extrabold text-foreground">Video Successfully Scheduled!</h4>
                <p className="text-xs text-muted-foreground">
                  Scheduled for{' '}
                  <strong className="text-foreground">
                    {new Date(successPost.scheduled_at || successPost.scheduledAt).toLocaleString('en-IN', {
                      timeZone: timezone,
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </strong>{' '}
                  ({timezone}).
                </p>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <a
                  href="/publishing?tab=scheduled"
                  className="px-5 py-2.5 rounded-xl bg-primary text-[#194350] font-bold text-xs"
                >
                  View in Publishing Center
                </a>
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-xs font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleScheduleSubmit} className="space-y-4">
              {/* Channel and Video Overview */}
              <div className="p-3 bg-muted/40 rounded-xl border border-border flex items-center gap-3">
                <div className="w-16 h-20 bg-black rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
                  {clip.previewUrl ? (
                    <video src={clip.previewUrl} className="w-full h-full object-cover" muted />
                  ) : (
                    <Youtube className="w-5 h-5 text-muted-foreground opacity-50" />
                  )}
                </div>
                <div className="space-y-1 min-w-0 flex-1 text-xs">
                  <div className="font-bold text-foreground truncate">{clip.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    Channel: <strong className="text-foreground">{channel?.title || 'Connected YouTube Channel'}</strong>
                  </div>
                  <div className="text-[10px] text-primary font-semibold">
                    Target Platform: YouTube Shorts (9:16 Vertical)
                  </div>
                </div>
              </div>

              {/* Title input */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground">Video Title</label>
                <input
                  type="text"
                  maxLength={100}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-card border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                  required
                />
              </div>

              {/* Date & Time Picker */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-foreground flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-primary" /> Publication Date
                  </label>
                  <input
                    type="date"
                    value={scheduledDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-card border border-border text-foreground text-xs focus:outline-none focus:border-primary cursor-pointer"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-foreground flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-primary" /> Publication Time
                  </label>
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-card border border-border text-foreground text-xs focus:outline-none focus:border-primary cursor-pointer"
                    required
                  />
                </div>
              </div>

              {/* Timezone */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-muted-foreground" /> Timezone
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-card border border-border text-foreground text-xs focus:outline-none focus:border-primary cursor-pointer"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST - Indian Standard Time, UTC+5:30)</option>
                  <option value="America/New_York">America/New_York (EST/EDT, UTC-5/UTC-4)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT, UTC-8/UTC-7)</option>
                  <option value="Europe/London">Europe/London (GMT/BST, UTC+0/UTC+1)</option>
                  <option value="UTC">UTC (Coordinated Universal Time)</option>
                </select>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-500 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !title.trim()}
                  className="px-6 py-2.5 rounded-xl bg-primary text-[#194350] font-extrabold text-xs flex items-center gap-2 shadow-md hover:opacity-95 disabled:opacity-50"
                >
                  <Calendar className="w-4 h-4" /> {isSubmitting ? 'Scheduling...' : 'Confirm Schedule'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

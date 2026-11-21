'use client';

import React, { useState } from 'react';
import {
  X,
  Play,
  Youtube,
  Calendar,
  Download,
  Scissors,
  ExternalLink,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { PublishModal } from './publish-modal';
import { ScheduleModal } from './schedule-modal';

export interface VideoPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  clip: {
    id: string;
    title: string;
    duration?: number;
    resolution?: string;
    previewUrl?: string;
    filePath?: string;
    createdAt?: string;
    processingStatus?: string;
    publishingStatus?: string;
    publishedUrl?: string;
    exportFileId?: string;
    projectId?: string;
    category?: string;
  } | null;
  onStatusUpdated?: () => void;
}

export function VideoPreviewModal({ isOpen, onClose, clip, onStatusUpdated }: VideoPreviewModalProps) {
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  if (!isOpen || !clip) return null;

  const isPublished = clip.publishingStatus === 'published' || clip.publishingStatus === 'PUBLISHED' || Boolean(clip.publishedUrl);
  const isScheduled = clip.publishingStatus === 'scheduled' || clip.publishingStatus === 'SCHEDULED';
  const isRendered = clip.processingStatus === 'rendered' || clip.processingStatus === 'ready' || clip.processingStatus === 'approved';

  const formatDuration = (sec?: number) => {
    if (!sec) return '30s';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m > 0 ? `${m}m ` : ''}${s}s`;
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in overflow-y-auto">
        <div className="relative w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden my-6">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-muted/30">
            <div className="space-y-0.5 min-w-0 pr-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-primary/10 text-primary border border-primary/20">
                  {clip.category || '9:16 VERTICAL SHORT'}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase border ${
                    isPublished
                      ? 'bg-rose-500/10 text-rose-500 border-rose-500/30'
                      : isScheduled
                      ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                  }`}
                >
                  {isPublished ? 'PUBLISHED' : isScheduled ? 'SCHEDULED' : 'READY TO PUBLISH'}
                </span>
              </div>
              <h3 className="text-sm font-extrabold text-foreground truncate">{clip.title}</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Video Player */}
          <div className="p-4 space-y-4">
            <div className="aspect-[9/16] max-h-[460px] bg-black rounded-xl overflow-hidden flex items-center justify-center mx-auto border border-border shadow-inner">
              {clip.previewUrl ? (
                <video
                  src={clip.previewUrl}
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-center p-6 text-muted-foreground text-xs">
                  <Play className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  Video preview unavailable
                </div>
              )}
            </div>

            {/* Video Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-muted/40 p-3 rounded-xl border border-border">
              <div>
                <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Duration</span>
                <span className="font-bold font-mono text-foreground">{formatDuration(clip.duration)}</span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Resolution</span>
                <span className="font-bold font-mono text-foreground">{clip.resolution || '1080x1920'}</span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Created</span>
                <span className="font-medium text-foreground">
                  {clip.createdAt ? new Date(clip.createdAt).toLocaleDateString() : 'Today'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Status</span>
                <span className="font-bold uppercase text-primary">
                  {clip.publishingStatus || clip.processingStatus || 'READY'}
                </span>
              </div>
            </div>

            {/* PROMINENT PUBLISHING ACTION BUTTONS (Directly in Video Preview) */}
            <div className="pt-2 border-t border-border space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {isPublished && clip.publishedUrl ? (
                  <a
                    href={clip.publishedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="col-span-full py-2.5 px-4 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md transition-colors"
                  >
                    <Youtube className="w-4 h-4" /> View on YouTube Shorts
                    <ExternalLink className="w-3.5 h-3.5 ml-1 opacity-80" />
                  </a>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowPublishModal(true)}
                      className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] text-[#194350] font-extrabold text-xs flex items-center justify-center gap-2 shadow-md hover:opacity-95 transition-all"
                    >
                      <Youtube className="w-4 h-4" /> PUBLISH NOW
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowScheduleModal(true)}
                      className="py-2.5 px-4 rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary font-extrabold text-xs flex items-center justify-center gap-2 transition-colors"
                    >
                      <Calendar className="w-4 h-4" /> SCHEDULE
                    </button>
                  </>
                )}
              </div>

              {/* Secondary utility actions */}
              <div className="flex items-center justify-between pt-1 text-xs">
                <div className="flex items-center gap-2">
                  {clip.previewUrl && (
                    <a
                      href={clip.previewUrl}
                      download={`${clip.id}_short.mp4`}
                      className="px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground font-semibold flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5 text-muted-foreground" /> Download MP4
                    </a>
                  )}

                  <Link
                    href={`/editor?clip=${clip.id}`}
                    className="px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground font-semibold flex items-center gap-1.5"
                  >
                    <Scissors className="w-3.5 h-3.5 text-primary" /> Fine-Tune in Editor
                  </Link>
                </div>

                <button
                  onClick={onClose}
                  className="px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Embedded Publish Now Modal */}
      {showPublishModal && (
        <PublishModal
          isOpen={showPublishModal}
          onClose={() => setShowPublishModal(false)}
          clip={clip}
          onSuccess={(res) => {
            setShowPublishModal(false);
            if (onStatusUpdated) onStatusUpdated();
          }}
        />
      )}

      {/* Embedded Schedule Modal */}
      {showScheduleModal && (
        <ScheduleModal
          isOpen={showScheduleModal}
          onClose={() => setShowScheduleModal(false)}
          clip={clip}
          onSuccess={(post) => {
            setShowScheduleModal(false);
            if (onStatusUpdated) onStatusUpdated();
          }}
        />
      )}
    </>
  );
}

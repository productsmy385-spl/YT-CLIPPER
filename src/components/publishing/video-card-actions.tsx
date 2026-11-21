'use client';

import React, { useState } from 'react';
import {
  Eye,
  Download,
  Scissors,
  Youtube,
  Calendar,
  MoreVertical,
  Edit2,
  Trash2,
  ExternalLink,
  Copy,
  CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';
import { PublishModal } from './publish-modal';
import { ScheduleModal } from './schedule-modal';
import { VideoPreviewModal } from './video-preview-modal';

export interface VideoCardActionsProps {
  clip: {
    id: string;
    title: string;
    duration?: number;
    resolution?: string;
    previewUrl?: string;
    filePath?: string;
    exportFileId?: string;
    projectId?: string;
    processingStatus?: string;
    publishingStatus?: string;
    publishedUrl?: string;
    category?: string;
    createdAt?: string;
  };
  onDelete?: (clip: any) => void;
  onRename?: (clip: any) => void;
  onStatusUpdated?: () => void;
  className?: string;
}

export function VideoCardActions({
  clip,
  onDelete,
  onRename,
  onStatusUpdated,
  className = '',
}: VideoCardActionsProps) {
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const isPublished =
    clip.publishingStatus === 'published' ||
    clip.publishingStatus === 'PUBLISHED' ||
    Boolean(clip.publishedUrl);

  const isScheduled =
    clip.publishingStatus === 'scheduled' ||
    clip.publishingStatus === 'SCHEDULED';

  const isProcessing =
    clip.processingStatus === 'in_progress' ||
    clip.processingStatus === 'extracting' ||
    clip.processingStatus === 'editing';

  const isFailed =
    clip.processingStatus === 'failed' || clip.processingStatus === 'error';

  return (
    <>
      <div className={`space-y-2 pt-2 border-t border-border ${className}`}>
        {/* Row 1: Primary Publishing Actions (Clearly Visible, Prominent) */}
        <div className="flex items-center gap-1.5">
          {isPublished && clip.publishedUrl ? (
            <a
              href={clip.publishedUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 py-1.5 px-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-extrabold text-[11px] flex items-center justify-center gap-1 shadow-sm transition-colors"
              title="View published short on YouTube"
            >
              <Youtube className="w-3.5 h-3.5" />
              <span>View on YouTube</span>
              <ExternalLink className="w-3 h-3 ml-0.5 opacity-80" />
            </a>
          ) : isScheduled ? (
            <div className="flex-1 flex items-center gap-1">
              <span className="flex-1 py-1.5 px-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 font-bold text-[11px] text-center flex items-center justify-center gap-1">
                <Calendar className="w-3 h-3" /> Scheduled
              </span>
              <button
                type="button"
                onClick={() => setShowScheduleModal(true)}
                className="py-1.5 px-2.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground text-[11px] font-semibold"
                title="Edit Scheduled Time"
              >
                Edit
              </button>
            </div>
          ) : isProcessing ? (
            <div className="flex-1 py-1.5 px-2 rounded-lg bg-muted border border-border text-muted-foreground text-[11px] font-semibold text-center">
              Processing Video...
            </div>
          ) : isFailed ? (
            <div className="flex-1 py-1.5 px-2 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-500 text-[11px] font-semibold text-center">
              Rendering Failed
            </div>
          ) : (
            <>
              {/* PUBLISH NOW - Clear & Prominent */}
              <button
                type="button"
                onClick={() => setShowPublishModal(true)}
                className="flex-1 py-1.5 px-2 rounded-lg bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] text-[#194350] font-extrabold text-[11px] flex items-center justify-center gap-1 shadow-xs hover:opacity-95 transition-all"
                title="Publish directly to YouTube Shorts"
              >
                <Youtube className="w-3.5 h-3.5 shrink-0" />
                <span>Publish Now</span>
              </button>

              {/* SCHEDULE BUTTON */}
              <button
                type="button"
                onClick={() => setShowScheduleModal(true)}
                className="py-1.5 px-2.5 rounded-lg border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary font-bold text-[11px] flex items-center justify-center gap-1 transition-colors"
                title="Schedule for future publication (Asia/Kolkata)"
              >
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span>Schedule</span>
              </button>
            </>
          )}
        </div>

        {/* Row 2: Secondary Utility Actions (Preview, Download, Edit, More Actions) */}
        <div className="flex items-center justify-between gap-1 text-[11px]">
          {/* Preview Button */}
          <button
            type="button"
            onClick={() => setShowPreviewModal(true)}
            className="flex-1 py-1 px-2 rounded-lg border border-border bg-card hover:bg-muted text-foreground font-semibold flex items-center justify-center gap-1 transition-colors"
            title="Preview full video with details"
          >
            <Eye className="w-3 h-3 text-primary" />
            <span>Preview</span>
          </button>

          {/* Download Button */}
          {clip.previewUrl ? (
            <a
              href={clip.previewUrl}
              download={`${clip.id}_short.mp4`}
              className="py-1 px-2 rounded-lg border border-border bg-card hover:bg-muted text-foreground font-semibold flex items-center justify-center gap-1 transition-colors"
              title="Download MP4"
            >
              <Download className="w-3 h-3 text-muted-foreground" />
              <span>Download</span>
            </a>
          ) : (
            <button
              disabled
              className="py-1 px-2 rounded-lg border border-border bg-muted opacity-40 text-muted-foreground"
            >
              Download
            </button>
          )}

          {/* Edit Button */}
          <Link
            href={`/editor?clip=${clip.id}`}
            className="py-1 px-2 rounded-lg border border-border bg-card hover:bg-muted text-foreground font-semibold flex items-center justify-center gap-1 transition-colors"
            title="Open in Video Editor"
          >
            <Scissors className="w-3 h-3 text-primary" />
            <span>Edit</span>
          </Link>

          {/* More Actions (Three-dot Menu) */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsDropdownOpen(!isDropdownOpen);
              }}
              className="w-7 h-7 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center"
              title="More Actions"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            {isDropdownOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 bottom-8 w-40 rounded-xl bg-card border border-border shadow-2xl p-1 z-50 text-xs animate-fade-in"
              >
                {onRename && (
                  <button
                    onClick={() => {
                      onRename(clip);
                      setIsDropdownOpen(false);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground flex items-center gap-2"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-muted-foreground" /> Rename
                  </button>
                )}

                <a
                  href={`/export?clip=${clip.id}`}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground flex items-center gap-2"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" /> Export Packages
                </a>

                {onDelete && (
                  <>
                    <div className="my-1 border-t border-border" />
                    <button
                      onClick={() => {
                        onDelete(clip);
                        setIsDropdownOpen(false);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-rose-500/10 text-rose-500 font-semibold flex items-center gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Move to Trash
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Video Preview Modal */}
      {showPreviewModal && (
        <VideoPreviewModal
          isOpen={showPreviewModal}
          onClose={() => setShowPreviewModal(false)}
          clip={clip}
          onStatusUpdated={onStatusUpdated}
        />
      )}

      {/* Publish Now Modal */}
      {showPublishModal && (
        <PublishModal
          isOpen={showPublishModal}
          onClose={() => setShowPublishModal(false)}
          clip={clip}
          onSuccess={() => {
            setShowPublishModal(false);
            if (onStatusUpdated) onStatusUpdated();
          }}
        />
      )}

      {/* Schedule Modal */}
      {showScheduleModal && (
        <ScheduleModal
          isOpen={showScheduleModal}
          onClose={() => setShowScheduleModal(false)}
          clip={clip}
          onSuccess={() => {
            setShowScheduleModal(false);
            if (onStatusUpdated) onStatusUpdated();
          }}
        />
      )}
    </>
  );
}

'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Youtube,
  Upload,
  CheckCircle2,
  AlertCircle,
  Play,
  Share2,
  Music,
  Smile,
  Type,
  Video,
  FileCheck2,
  RefreshCw,
  HardDrive,
  Volume2,
  Clock,
  ArrowRight,
  ShieldCheck,
  XCircle,
  StopCircle,
  Check,
  ExternalLink,
  PlusCircle,
  Layers,
  Sliders,
  Scissors,
  AlertTriangle,
  FileVideo,
  Zap,
} from 'lucide-react';
import { formatBytes, formatDuration } from '@/lib/utils';

interface UploadedMetadata {
  filePath: string;
  fileName: string;
  fileSize: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  audioChannels: number;
  audioCodec?: string;
  checksum?: string;
  videoId?: string;
}

interface DuplicateConfirmation {
  existingProject: {
    id: string;
    title: string;
    status: string;
    createdAt: string;
  };
  filePath: string;
  checksum: string;
  fileName: string;
  fileSize: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  audioChannels: number;
  audioCodec?: string;
}

interface IngestedYouTubeMeta {
  videoId?: string;
  title: string;
  authorName?: string;
  thumbnailUrl?: string;
  duration?: number;
  filePath?: string;
  canProcess: boolean;
  errorMessage?: string;
  errorState?: string;
  metadataRetrieved?: boolean;
}

// 10 Official Processing Stages matching the multi-agent architecture
const PROCESSING_STAGES = [
  { id: 1, key: 'validating', label: 'Validating source link', desc: 'Verifying URL format & access permissions' },
  { id: 2, key: 'retrieving', label: 'Retrieving video information', desc: 'Fetching stream metadata & resolution' },
  { id: 3, key: 'source_processing', label: 'Processing authorized source video', desc: 'Isolating gameplay footage & audio channels' },
  { id: 4, key: 'analyzing', label: 'Analyzing video', desc: 'Multi-scene scan & speech detection' },
  { id: 5, key: 'highlights', label: 'Detecting highlights', desc: 'Scoring crazy & funny moments' },
  { id: 6, key: 'extracting', label: 'Extracting clips', desc: 'Lossless clip trimming with audio buffers' },
  { id: 7, key: 'editing', label: 'Editing clips', desc: '9:16 vertical composition, memes & BGM' },
  { id: 8, key: 'subtitles', label: 'Generating subtitles', desc: 'Word-level animated typography' },
  { id: 9, key: 'qa', label: 'Running quality checks', desc: 'Verifying sync, black frames & compliance' },
  { id: 10, key: 'export', label: 'Exporting final videos', desc: 'Packaging 1080x1920 YouTube Shorts & Reels' },
];

function getActiveStageIndex(stage: string, progress: number, stageId?: string): number {
  if (stageId) {
    const parsed = parseInt(stageId, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) {
      return parsed - 1;
    }
  }
  const s = (stage || '').toLowerCase();
  if (s.includes('validat') || progress < 5) return 0;
  if (s.includes('retriev') || s.includes('metadata') || (progress >= 5 && progress < 10)) return 1;
  if (s.includes('source') || s.includes('ingest') || (progress >= 10 && progress < 20)) return 2;
  if (s.includes('analyz') || (progress >= 20 && progress < 35)) return 3;
  if (s.includes('highlight') || (progress >= 35 && progress < 45)) return 4;
  if (s.includes('extract') || (progress >= 45 && progress < 60)) return 5;
  if (s.includes('edit') || s.includes('meme') || s.includes('music') || s.includes('sfx') || (progress >= 60 && progress < 80)) return 6;
  if (s.includes('subtitle') || (progress >= 80 && progress < 88)) return 7;
  if (s.includes('qa') || s.includes('complian') || s.includes('qualit') || (progress >= 88 && progress < 95)) return 8;
  if (s.includes('export') || s.includes('packag') || s.includes('complete') || s.includes('ready') || progress >= 95) return 9;
  return Math.min(9, Math.floor(progress / 10));
}

const WORKFLOW_STAGES = [
  { step: 1, name: 'Source', desc: 'YouTube / Upload' },
  { step: 2, name: 'Inspect', desc: 'Verify Metadata' },
  { step: 3, name: 'Analyze', desc: 'Multi-Scene Scan' },
  { step: 4, name: 'Highlights', desc: 'Scoring & Selection' },
  { step: 5, name: 'Generate', desc: '9:16 Render & SFX' },
  { step: 6, name: 'Review', desc: 'QA & Compliance' },
  { step: 7, name: 'Publish', desc: 'Auto-Post / Schedule' },
];

export default function CreateShortsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadXhrRef = useRef<XMLHttpRequest | null>(null);
  const isSubmittingRef = useRef(false);

  // Source selection state - Starts completely empty!
  const [sourceMode, setSourceMode] = useState<'youtube' | 'upload'>('youtube');
  const [youtubeUrl, setYoutubeUrl] = useState<string>('');
  const [checkingUrl, setCheckingUrl] = useState(false);
  const [ytMeta, setYtMeta] = useState<IngestedYouTubeMeta | null>(null);
  const [ytRights, setYtRights] = useState<any>(null);
  const [ytAcquisition, setYtAcquisition] = useState<any>(null);

  // Local file upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [clientFileMeta, setClientFileMeta] = useState<{ duration: number; width: number; height: number } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadBytes, setUploadBytes] = useState<{ loaded: number; total: number } | null>(null);
  const [uploadedData, setUploadedData] = useState<UploadedMetadata | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [duplicateConfirmation, setDuplicateConfirmation] = useState<DuplicateConfirmation | null>(null);
  const [autoStartOnUpload, setAutoStartOnUpload] = useState(true);

  // Step 2: Editing preferences - Starts clean
  const [title, setTitle] = useState<string>('');
  const [durationPreset, setDurationPreset] = useState<'15s' | '30s' | '60s'>('30s');
  const [memeIntensity, setMemeIntensity] = useState<'subtle' | 'balanced' | 'high'>('balanced');
  const [musicStyle, setMusicStyle] = useState<'phonk' | 'synthwave' | 'comedy' | 'none'>('phonk');
  const [subtitleStyle, setSubtitleStyle] = useState<'coral_neon' | 'soft_peach' | 'clean_white'>('coral_neon');
  const [platforms, setPlatforms] = useState({
    youtubeShorts: true,
    instagramReels: true,
    tiktok: true,
  });

  // Step 3: Real-Time Processing & Automation State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [currentStage, setCurrentStage] = useState<string>('Validating source link');
  const [currentStageId, setCurrentStageId] = useState<string>('1');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Completion workflow state
  const [completedProject, setCompletedProject] = useState<{
    id: string;
    title: string;
    clipsCount: number;
  } | null>(null);

  // Cancel Confirmation Modal State
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Check for active background job on initial mount (persists across page reload or navigation)
  useEffect(() => {
    try {
      const savedProjectId = sessionStorage.getItem('gta6_active_project_id');
      if (savedProjectId) {
        fetch(`/api/projects/${savedProjectId}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.project) {
              const p = data.project;
              if (p.status === 'in_progress' || p.status === 'created') {
                setActiveProjectId(savedProjectId);
                setIsSubmitting(true);
                isSubmittingRef.current = true;
                setProgressPercent(p.progress || 2);
                setCurrentStage(p.current_stage || 'Validating source link');
                if (p.stage_id) setCurrentStageId(String(p.stage_id));
              } else if (p.status === 'error') {
                setSubmitError(p.error_message || p.current_stage || 'Previous processing job failed.');
                sessionStorage.removeItem('gta6_active_project_id');
              } else if (p.status === 'ready' || p.status === 'completed') {
                sessionStorage.removeItem('gta6_active_project_id');
              } else {
                sessionStorage.removeItem('gta6_active_project_id');
              }
            }
          })
          .catch(() => {});
      }
    } catch {}
  }, []);

  // Debounced URL validation on user typing - Only runs when URL is actually provided
  useEffect(() => {
    if (sourceMode === 'youtube' && youtubeUrl.trim().length > 10) {
      const timer = setTimeout(() => {
        verifyYouTubeUrl(youtubeUrl);
      }, 500);
      return () => clearTimeout(timer);
    } else if (sourceMode === 'youtube' && !youtubeUrl.trim()) {
      setYtMeta(null);
    }
  }, [youtubeUrl, sourceMode]);

  // Elapsed timer when active job is running
  useEffect(() => {
    let interval: any = null;
    if (isSubmitting && !isCancelled) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isSubmitting, isCancelled]);

  // Live Background Job Polling Loop (Every 1.5s)
  useEffect(() => {
    if (!activeProjectId || !isSubmitting) return;

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${activeProjectId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted || !data?.project) return;

        const proj = data.project;

        if (proj.stage_id) {
          setCurrentStageId(String(proj.stage_id));
        }

        if (proj.status === 'in_progress' || proj.status === 'created') {
          setProgressPercent((prev) => Math.max(prev, proj.progress || 2));
          if (proj.current_stage) {
            setCurrentStage(proj.current_stage);
          }
        } else if (proj.status === 'ready' || proj.status === 'completed' || (proj.progress >= 100)) {
          // ================= SUCCESS & AUTOMATIC FORM RESET =================
          clearInterval(interval);
          setProgressPercent(100);
          setCurrentStage('All videos successfully exported & verified');
          setIsSubmitting(false);
          isSubmittingRef.current = false;
          setActiveProjectId(null);
          try {
            sessionStorage.removeItem('gta6_active_project_id');
          } catch {}

          // Auto-reset form input fields cleanly for next project
          setYoutubeUrl('');
          setTitle('');
          setYtMeta(null);
          setSelectedFile(null);
          setClientFileMeta(null);
          setUploadedData(null);
          setDuplicateConfirmation(null);
          if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
          }
          setUploadProgress(0);
          setUploadBytes(null);
          setUploadError(null);

          // Trigger completion notification banner
          setCompletedProject({
            id: proj.id,
            title: proj.title || 'GTA 6 Gameplay Shorts',
            clipsCount: data.clips?.length || 0,
          });
        } else if (proj.status === 'cancelled') {
          clearInterval(interval);
          setIsSubmitting(false);
          isSubmittingRef.current = false;
          setIsCancelled(true);
          setActiveProjectId(null);
          try {
            sessionStorage.removeItem('gta6_active_project_id');
          } catch {}
        } else if (proj.status === 'error') {
          clearInterval(interval);
          setIsSubmitting(false);
          isSubmittingRef.current = false;
          setActiveProjectId(null);
          setSubmitError(proj.error_message || proj.current_stage || 'Video processing encountered an error. Please verify the source file.');
          try {
            sessionStorage.removeItem('gta6_active_project_id');
          } catch {}
        }
      } catch (err: any) {
        console.warn('[CreateShorts] Polling error:', err.message);
      }
    }, 1500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeProjectId, isSubmitting, previewUrl]);

  const verifyYouTubeUrl = async (urlToVerify: string) => {
    if (!urlToVerify.trim()) return;
    setCheckingUrl(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: urlToVerify.trim(),
        }),
      });
      const data = await res.json();
      if (data.sourceInfo) {
        setYtMeta(data.sourceInfo);
        setYtRights(data.rights || null);
        setYtAcquisition(data.acquisition || null);
        if (data.sourceInfo.canProcess && data.sourceInfo.title && !data.sourceInfo.title.toLowerCase().includes('invalid')) {
          setTitle((prev) => (prev && prev.trim().length > 0 && !prev.toLowerCase().includes('invalid') ? prev : data.sourceInfo.title));
        } else if (title.toLowerCase().includes('invalid')) {
          setTitle('');
        }
      }
    } catch (err: any) {
      console.warn('URL inspection note:', err.message);
    } finally {
      setCheckingUrl(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const processSelectedFile = (file: File) => {
    const lowerName = file.name.toLowerCase();
    const isValid = lowerName.endsWith('.mp4') || lowerName.endsWith('.mov') || lowerName.endsWith('.webm') || lowerName.endsWith('.mkv') || file.type.startsWith('video/');
    if (!isValid) {
      setUploadError('Please select a valid video container (.mp4, .mov, or .webm)');
      return;
    }

    setUploadError(null);
    setDuplicateConfirmation(null);
    setSelectedFile(file);
    if (!title || title.trim().length === 0) {
      setTitle(file.name.replace(/\.[^/.]+$/, ''));
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);

    // Read client-side duration & resolution via video element
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.src = localUrl;
    tempVideo.onloadedmetadata = () => {
      setClientFileMeta({
        duration: tempVideo.duration || 0,
        width: tempVideo.videoWidth || 0,
        height: tempVideo.videoHeight || 0,
      });
    };

    uploadFileToServer(file);
  };

  const cancelUpload = () => {
    if (uploadXhrRef.current) {
      uploadXhrRef.current.abort();
      uploadXhrRef.current = null;
    }
    setUploading(false);
    setUploadProgress(0);
    setUploadBytes(null);
    setSelectedFile(null);
    setClientFileMeta(null);
    setUploadError('Upload cancelled by user.');
  };

  const uploadFileToServer = async (file: File, confirmReuse = false): Promise<UploadedMetadata | null> => {
    setUploading(true);
    setUploadProgress(0);
    setUploadBytes(null);
    setUploadError(null);
    setDuplicateConfirmation(null);

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      uploadXhrRef.current = xhr;
      const formData = new FormData();
      formData.append('video', file);
      if (ytMeta?.videoId) {
        formData.append('videoId', ytMeta.videoId);
      }
      if (confirmReuse) {
        formData.append('confirmReuse', 'true');
      }

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percent);
          setUploadBytes({ loaded: event.loaded, total: event.total });
        }
      };

      xhr.onload = () => {
        setUploading(false);
        uploadXhrRef.current = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.requiresConfirmation && data.existingProject) {
              setDuplicateConfirmation(data);
              resolve(null);
              return;
            }
            if (data.success && data.filePath) {
              setUploadedData(data);
              setUploadProgress(100);
              resolve(data);

              // Auto-start pipeline if enabled and not already running
              if (autoStartOnUpload && !isSubmittingRef.current) {
                setTimeout(() => {
                  startAutomationWithSource(data.filePath);
                }, 400);
              }
            } else {
              setUploadError(data.error || 'Server failed to inspect video stream.');
              resolve(null);
            }
          } catch {
            setUploadError('Invalid server response format.');
            resolve(null);
          }
        } else {
          try {
            const errData = JSON.parse(xhr.responseText);
            setUploadError(errData.error || `Upload failed with status ${xhr.status}`);
          } catch {
            setUploadError(`Upload failed with status ${xhr.status}`);
          }
          resolve(null);
        }
      };

      xhr.onerror = () => {
        setUploading(false);
        uploadXhrRef.current = null;
        setUploadError('Network error during file upload. Please verify your connection.');
        resolve(null);
      };

      xhr.onabort = () => {
        setUploading(false);
        uploadXhrRef.current = null;
        setUploadError('Upload cancelled.');
        resolve(null);
      };

      xhr.open('POST', '/api/upload');
      xhr.send(formData);
    });
  };

  const handleConfirmDuplicate = () => {
    if (!duplicateConfirmation) return;
    const confirmedData: UploadedMetadata = {
      filePath: duplicateConfirmation.filePath,
      checksum: duplicateConfirmation.checksum,
      fileName: duplicateConfirmation.fileName,
      fileSize: duplicateConfirmation.fileSize,
      duration: duplicateConfirmation.duration,
      width: duplicateConfirmation.width,
      height: duplicateConfirmation.height,
      fps: duplicateConfirmation.fps,
      hasAudio: duplicateConfirmation.hasAudio,
      audioChannels: duplicateConfirmation.audioChannels,
      audioCodec: duplicateConfirmation.audioCodec,
    };
    setUploadedData(confirmedData);
    setDuplicateConfirmation(null);

    if (autoStartOnUpload && !isSubmittingRef.current) {
      setTimeout(() => {
        startAutomationWithSource(confirmedData.filePath);
      }, 300);
    }
  };

  const startAutomationWithSource = async (sourceFilePath?: string) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    setSubmitError(null);
    setCompletedProject(null);
    setIsCancelled(false);

    setIsSubmitting(true);
    setProgressPercent(1);
    setCurrentStage(sourceFilePath ? 'Initiating multi-agent pipeline...' : 'Acquiring authorized source media...');
    setCurrentStageId('1');

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || ytMeta?.title || undefined,
          sourceUrl: sourceMode === 'youtube' && youtubeUrl.trim() ? youtubeUrl.trim() : undefined,
          sourceFile: sourceFilePath,
          creatorName: ytMeta?.authorName || undefined,
          preset: {
            durationPreset,
            memeIntensity,
            musicStyle,
            subtitleStyle,
            platforms,
          },
        }),
      });

      const data = await res.json();
      if (data.projectId) {
        setActiveProjectId(data.projectId);
        try {
          sessionStorage.setItem('gta6_active_project_id', data.projectId);
        } catch {}
        setProgressPercent(data.progress || 2);
        setCurrentStage(data.currentStage || 'Validating source link');
        setCurrentStageId(data.stageId || '1');
      } else {
        setSubmitError(data.error || 'Failed to initialize project automation.');
        setIsSubmitting(false);
        isSubmittingRef.current = false;
      }
    } catch (err: any) {
      setSubmitError(err.message || 'Network error initiating workflow.');
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current || isSubmitting) return;

    setSubmitError(null);
    setCompletedProject(null);
    setIsCancelled(false);

    let resolvedSourceFile: string | undefined = undefined;

    if (sourceMode === 'upload') {
      if (!uploadedData && !selectedFile) {
        setSubmitError('Please select or drag-and-drop an authorized video file.');
        return;
      }

      if (!uploadedData && selectedFile) {
        setIsSubmitting(true);
        setCurrentStage('Uploading video source to server...');
        const uploaded = await uploadFileToServer(selectedFile);
        if (!uploaded) {
          setSubmitError('Failed to upload video source. Please try again.');
          setIsSubmitting(false);
          return;
        }
        resolvedSourceFile = uploaded.filePath;
      } else if (uploadedData) {
        resolvedSourceFile = uploadedData.filePath;
      }
    } else {
      if (!youtubeUrl.trim()) {
        setSubmitError('Please enter a YouTube video or stream link.');
        return;
      }
      if (!uploadedData && !ytMeta?.filePath && !ytAcquisition?.isAvailable) {
        setSubmitError(ytAcquisition?.reason || 'An authorized video recording must be attached before extraction can begin.');
        return;
      }
      resolvedSourceFile = uploadedData?.filePath || ytMeta?.filePath;
    }

    startAutomationWithSource(resolvedSourceFile);
  };

  const handleCancelJob = async () => {
    if (!activeProjectId) {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
      setCancelModalOpen(false);
      return;
    }

    setIsCancelling(true);
    try {
      const res = await fetch(`/api/projects/${activeProjectId}/cancel`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        setIsCancelled(true);
        setIsSubmitting(false);
        isSubmittingRef.current = false;
        setActiveProjectId(null);
        setCurrentStage('Processing cancelled by user');
        try {
          sessionStorage.removeItem('gta6_active_project_id');
        } catch {}
      }
    } catch (err) {
      console.error('Cancel request failed:', err);
    } finally {
      setIsCancelling(false);
      setCancelModalOpen(false);
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const activeStageIdx = getActiveStageIndex(currentStage, progressPercent, currentStageId);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Clean Studio Header */}
      <div className="border-b border-border pb-4">
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          Create Shorts & Reels
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Automated YouTube-to-AI-Shorts platform: verified source ingestion, highlight detection, smart 9:16 framing, meme audio ducking, and YouTube publishing.
        </p>

        {/* 7-Stage Workflow Roadmap */}
        <div className="mt-4 hidden md:flex items-center justify-between gap-1 p-2.5 rounded-xl border border-border bg-card">
          {WORKFLOW_STAGES.map((s, idx) => (
            <div key={s.step} className="flex items-center gap-1.5 text-xs">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  idx === 0
                    ? 'bg-primary text-[#194350]'
                    : 'bg-muted text-muted-foreground border border-border'
                }`}
              >
                {s.step}
              </span>
              <div>
                <span className={`font-bold ${idx === 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {s.name}
                </span>
                <span className="hidden lg:inline text-[10px] text-muted-foreground block -mt-0.5">
                  {s.desc}
                </span>
              </div>
              {idx < WORKFLOW_STAGES.length - 1 && <span className="text-border mx-1">›</span>}
            </div>
          ))}
        </div>
      </div>

      {/* ================= COMPLETED PROJECT CELEBRATION BANNER ================= */}
      {completedProject && (
        <div className="p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 space-y-3.5 shadow-sm animate-fade-in">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-extrabold text-foreground">
                    Project Completed Successfully!
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                    Ready to Publish
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Extracted <span className="font-bold text-foreground">{completedProject.clipsCount} vertical Shorts</span> from{' '}
                  <span className="font-bold text-foreground">&quot;{completedProject.title}&quot;</span>. All frames, audio tracks, and subtitles are verified.
                </p>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold mt-1">
                  ✓ Form input fields have been automatically reset and are ready for your next video.
                </p>
              </div>
            </div>

            <button
              onClick={() => setCompletedProject(null)}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border bg-card"
            >
              Dismiss
            </button>
          </div>

          <div className="flex items-center gap-2.5 pt-1">
            <Link
              href={`/projects/${completedProject.id}`}
              className="px-4 py-2 rounded-xl bg-primary text-[#194350] font-extrabold text-xs shadow-sm hover:opacity-95 transition-all flex items-center gap-1.5"
            >
              <Video className="w-3.5 h-3.5" />
              <span>View Generated Shorts</span>
              <ArrowRight className="w-3 h-3 stroke-[3]" />
            </Link>
            <Link
              href="/editor"
              className="px-3.5 py-2 rounded-xl border border-border bg-card hover:bg-muted text-foreground font-bold text-xs transition-colors flex items-center gap-1.5"
            >
              <Scissors className="w-3.5 h-3.5 text-primary" />
              <span>Open in Video Editor</span>
            </Link>
            <button
              onClick={() => setCompletedProject(null)}
              className="px-3.5 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Create Another Project
            </button>
          </div>
        </div>
      )}

      {/* ================= REAL-TIME 10-STAGE PROCESSING LOADER ================= */}
      {isSubmitting && (
        <div className="p-5 rounded-2xl border border-primary/40 bg-card space-y-4 shadow-md animate-fade-in">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3.5">
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-primary animate-spin" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs sm:text-sm font-extrabold text-foreground">
                    Stage {activeStageIdx + 1} of 10: {PROCESSING_STAGES[activeStageIdx]?.label}
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/20 text-[#ff8882] border border-primary/30">
                    LIVE PIPELINE
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {currentStage} • Elapsed: <span className="font-mono text-foreground font-semibold">{formatTimer(elapsedSeconds)}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              {activeProjectId && (
                <Link
                  href={`/projects/${activeProjectId}`}
                  target="_blank"
                  className="px-2.5 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Inspect Logs</span>
                </Link>
              )}
              <button
                type="button"
                onClick={() => setCancelModalOpen(true)}
                className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-500/20 transition-colors flex items-center gap-1.5"
              >
                <StopCircle className="w-3.5 h-3.5" />
                Cancel Job
              </button>
            </div>
          </div>

          {/* Progress Bar & Percentage */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="font-bold text-foreground">Overall Pipeline Progress</span>
              <span className="font-mono font-extrabold text-primary text-sm">{progressPercent}%</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden border border-border p-0.5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#ff8882] via-[#ffaa9b] to-[#ffc2b4] transition-all duration-300"
                style={{ width: `${Math.max(progressPercent, 4)}%` }}
              />
            </div>
          </div>

          {/* 10 Visual Processing Stages */}
          <div className="pt-2">
            <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5">
              Multi-Agent Execution Pipeline (10 Stages)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PROCESSING_STAGES.map((stg, idx) => {
                const isDone = idx < activeStageIdx || progressPercent === 100;
                const isActive = idx === activeStageIdx && progressPercent < 100;

                return (
                  <div
                    key={stg.id}
                    className={`p-2.5 rounded-lg border transition-all flex items-start gap-2.5 text-xs ${
                      isActive
                        ? 'border-primary/50 bg-primary/10 shadow-sm'
                        : isDone
                        ? 'border-emerald-500/30 bg-emerald-500/5 opacity-90'
                        : 'border-border/60 bg-muted/20 opacity-60'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isDone ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : isActive ? (
                        <RefreshCw className="w-4 h-4 text-primary animate-spin" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-border flex items-center justify-center text-[10px] text-muted-foreground">
                          {stg.id}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className={`font-bold truncate ${isActive ? 'text-primary' : isDone ? 'text-emerald-500' : 'text-foreground'}`}>
                        {stg.id}. {stg.label}
                      </p>
                      <p className="text-[10px] text-muted-foreground line-clamp-1">{stg.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Banner */}
      {isCancelled && (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-foreground text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Processing cancelled. Active rendering stopped and queued agents aborted.</span>
          </div>
          <button
            onClick={() => {
              setIsCancelled(false);
              setIsSubmitting(false);
            }}
            className="px-3 py-1 rounded-md bg-card border border-border text-foreground hover:bg-muted text-xs font-bold"
          >
            Start New Job
          </button>
        </div>
      )}

      {/* Submission Error Banner */}
      {submitError && (
        <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{submitError}</span>
          </div>
          <button onClick={() => setSubmitError(null)} className="text-xs underline hover:no-underline font-bold">
            Dismiss
          </button>
        </div>
      )}

      {/* ================= PROJECT CREATION FORM ================= */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ================= STEP 1: SOURCE ================= */}
        <div className="vice-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[#194350] text-xs font-bold">
                1
              </span>
              <h2 className="font-bold text-sm text-foreground">Video Source</h2>
            </div>
            <div className="flex items-center gap-1 bg-muted p-1 rounded-lg text-xs font-semibold border border-border">
              <button
                type="button"
                onClick={() => setSourceMode('youtube')}
                className={`px-3 py-1 rounded-md transition-all ${
                  sourceMode === 'youtube'
                    ? 'bg-card text-foreground shadow-sm font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                YouTube URL
              </button>
              <button
                type="button"
                onClick={() => setSourceMode('upload')}
                className={`px-3 py-1 rounded-md transition-all ${
                  sourceMode === 'upload'
                    ? 'bg-card text-foreground shadow-sm font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Direct File Upload
              </button>
            </div>
          </div>

          {/* Mode A: YouTube URL */}
          {sourceMode === 'youtube' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Youtube className="absolute left-3 top-2.5 h-4 w-4 text-red-500" />
                  <input
                    type="url"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        verifyYouTubeUrl(youtubeUrl);
                      }
                    }}
                    placeholder="Paste YouTube gaming video or stream link (e.g. https://www.youtube.com/watch?v=...)"
                    className="w-full rounded-lg border border-border bg-input pl-9 pr-9 py-2 text-xs text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
                  />
                  {youtubeUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setYoutubeUrl('');
                        setYtMeta(null);
                        setTitle('');
                        setUploadedData(null);
                        setSelectedFile(null);
                        setDuplicateConfirmation(null);
                      }}
                      className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                      title="Clear URL"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => verifyYouTubeUrl(youtubeUrl)}
                  disabled={checkingUrl || !youtubeUrl.trim()}
                  className="px-3.5 py-2 rounded-lg border border-border bg-muted hover:bg-muted/80 text-xs font-semibold text-foreground flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {checkingUrl ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileCheck2 className="w-3.5 h-3.5 text-primary" />
                  )}
                  <span>Inspect</span>
                </button>
              </div>

              {/* YouTube Metadata Preview Card */}
              {ytMeta && (
                <div className="p-3.5 rounded-xl border border-border bg-muted/40 space-y-3">
                  <div className="flex flex-col sm:flex-row items-start gap-3">
                    {ytMeta.thumbnailUrl && (
                      <img
                        src={ytMeta.thumbnailUrl}
                        alt="Thumbnail"
                        className="w-full sm:w-28 aspect-video rounded-lg object-cover border border-border shrink-0 bg-muted"
                      />
                    )}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {ytMeta.metadataRetrieved ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                            METADATA VERIFIED
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                            VALIDATION NOTICE
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground font-medium">
                          {ytMeta.authorName || 'Gaming Streamer'}
                        </span>
                      </div>
                      <h4 className="font-bold text-xs sm:text-sm text-foreground truncate">
                        {ytMeta.title?.toLowerCase().includes('invalid') ? 'YouTube Source Validation Notice' : ytMeta.title}
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        YouTube ID: <span className="font-mono text-foreground font-bold">{ytMeta.videoId || 'Not Extracted'}</span>
                      </p>
                    </div>
                  </div>

                  {/* Rights Status Badge & Summary */}
                  {ytRights && (
                    <div className="p-2.5 rounded-lg border border-border text-xs flex items-center justify-between gap-2 bg-muted/40">
                      <div className="flex items-center gap-2">
                        {ytRights.status === 'VERIFIED' ? (
                          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : ytRights.status === 'CREATIVE_COMMONS' ? (
                          <ShieldCheck className="w-4 h-4 text-blue-500 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                        )}
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-[11px] text-foreground">Rights Assessment:</span>
                            <span
                              className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded border ${
                                ytRights.status === 'VERIFIED'
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                                  : ytRights.status === 'CREATIVE_COMMONS'
                                  ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30'
                                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                              }`}
                            >
                              {ytRights.status === 'VERIFIED'
                                ? 'CREATOR AUTHORIZATION VERIFIED'
                                : ytRights.status === 'CREATIVE_COMMONS'
                                ? 'CREATIVE COMMONS (CC BY)'
                                : 'STANDARD YOUTUBE LICENSE (UNREGISTERED)'}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {ytRights.reason || (ytRights.isAllowed ? 'Usage permitted under verified rights policy' : 'Standard YouTube rights require creator upload or partner agreement')}
                          </p>
                        </div>
                      </div>
                      {ytRights.attributionText && (
                        <span className="hidden sm:inline text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border shrink-0">
                          CC BY Attributed
                        </span>
                      )}
                    </div>
                  )}

                  {/* ================= SOURCE ACQUISITION & ATTACHMENT CARD ================= */}
                  <div className="pt-2 border-t border-border space-y-2.5">
                    {/* CASE 1: Verified recording already attached */}
                    {uploadedData ? (
                      <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                        <div className="flex items-start gap-2.5">
                          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-foreground">
                                Authorized Recording Attached: {uploadedData.fileName}
                              </span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                                VERIFIED
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {formatDuration(uploadedData.duration)} • {uploadedData.width}×{uploadedData.height} • {formatBytes(uploadedData.fileSize)} • {uploadedData.hasAudio ? 'Stereo Audio OK' : 'No Audio'}
                            </p>
                            {uploadedData.checksum && (
                              <p className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate max-w-sm">
                                SHA-256: {uploadedData.checksum}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setUploadedData(null);
                              setSelectedFile(null);
                              setClientFileMeta(null);
                              setDuplicateConfirmation(null);
                            }}
                            className="px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Replace File
                          </button>
                        </div>
                      </div>
                    ) : duplicateConfirmation ? (
                      /* CASE 2: Duplicate recording detected across projects - Confirmation Gate */
                      <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-2.5 text-xs">
                        <div className="flex items-start gap-2.5">
                          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-extrabold text-foreground block">
                              Recording Previously Processed
                            </span>
                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                              This exact video recording was previously processed in project{' '}
                              <span className="font-bold text-foreground">&quot;{duplicateConfirmation.existingProject.title}&quot;</span>.
                              Do you want to attach it anyway to generate a new, independent project?
                            </p>
                            <p className="text-[10px] font-mono text-muted-foreground mt-1">
                              File: {duplicateConfirmation.fileName} ({formatBytes(duplicateConfirmation.fileSize)}, {formatDuration(duplicateConfirmation.duration)})
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={handleConfirmDuplicate}
                            className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs shadow-sm transition-colors flex items-center gap-1.5"
                          >
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                            <span>Confirm & Attach Anyway</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDuplicateConfirmation(null);
                              setSelectedFile(null);
                              setClientFileMeta(null);
                            }}
                            className="px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Choose Different File
                          </button>
                        </div>
                      </div>
                    ) : ytAcquisition?.isAvailable ? (
                      /* CASE 3: Authorized Source Acquisition Available (URL-Only Workflow!) */
                      <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 space-y-3 text-xs">
                        <div className="flex items-start gap-2.5">
                          <Zap className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-foreground text-sm">
                                Authorized Media Stream Ready
                              </span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                                {ytAcquisition.providerName || 'Direct Acquisition'}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                              {ytAcquisition.reason || 'Authorized original media can be ingested directly without requiring a manual file upload.'}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => startAutomationWithSource(undefined)}
                            disabled={isSubmitting}
                            className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm transition-colors flex items-center justify-center gap-2"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Acquire Media & Start AI Processing</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="px-3 py-2 rounded-lg border border-border bg-card hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1.5"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>Or Upload Custom File</span>
                          </button>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
                            onChange={handleFileInputChange}
                            className="hidden"
                          />
                        </div>
                      </div>
                    ) : (
                      /* CASE 4: Direct Acquisition Not Available -> Transparent Explanation + Dropzone */
                      <div className="space-y-3">
                        <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-1 text-xs">
                          <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>Direct Video Acquisition Unavailable</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            {ytAcquisition?.reason || 'YouTube Data API retrieves metadata only. YouTube terms restrict downloading 3rd-party audiovisual media. Upload the original gameplay recording below to proceed with AI highlight detection.'}
                          </p>
                        </div>

                        <div className="space-y-2.5">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                            <div>
                              <span className="font-bold text-foreground flex items-center gap-1.5">
                                <FileVideo className="w-4 h-4 text-primary" />
                                Attach Authorized Original Recording
                              </span>
                              <span className="text-[11px] text-muted-foreground block mt-0.5">
                                Upload your authentic recording (.mp4, .mov) corresponding to this video.
                              </span>
                            </div>
                            <span className="text-[10px] font-semibold text-muted-foreground shrink-0 self-start sm:self-auto">
                              MP4 / MOV (Up to 4K / 60fps)
                            </span>
                          </div>

                          {/* Interactive Drag-and-Drop Area */}
                          <div
                            onDragOver={(e) => {
                              e.preventDefault();
                              setIsDragging(true);
                            }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={handleFileDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                              isDragging
                                ? 'border-primary bg-primary/10 scale-[1.005]'
                                : 'border-border hover:border-primary/50 bg-card hover:bg-muted/30'
                            }`}
                          >
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
                              onChange={handleFileInputChange}
                              className="hidden"
                            />
                            <Upload className="w-6 h-6 mx-auto text-primary mb-1.5" />
                            <p className="text-xs font-bold text-foreground">
                              Drag & drop recording file here or <span className="text-primary underline">browse</span>
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Desktop & mobile supported • Lossless frame & audio verification via FFprobe
                            </p>
                          </div>

                          {/* Upload Progress Bar & Bytes Indicator */}
                          {uploading && (
                            <div className="space-y-1.5 p-3 rounded-xl border border-primary/30 bg-primary/5 text-xs animate-fade-in">
                              <div className="flex justify-between items-center text-muted-foreground font-semibold">
                                <span className="flex items-center gap-1.5 text-foreground">
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                                  Uploading {selectedFile?.name}...
                                </span>
                                <span className="font-mono font-bold text-primary">{uploadProgress}%</span>
                              </div>
                              <div className="w-full h-2 bg-muted rounded-full overflow-hidden border border-border">
                                <div
                                  className="h-full bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] transition-all duration-200"
                                  style={{ width: `${Math.max(uploadProgress, 5)}%` }}
                                />
                              </div>
                              <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                                <span>
                                  {uploadBytes ? `${formatBytes(uploadBytes.loaded)} of ${formatBytes(uploadBytes.total)}` : 'Verifying video stream...'}
                                </span>
                                <button
                                  type="button"
                                  onClick={cancelUpload}
                                  className="text-red-500 hover:underline font-bold"
                                >
                                  Cancel Upload
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Upload Error Banner with Retry */}
                          {uploadError && (
                            <div className="p-2.5 rounded-lg border border-red-500/30 bg-red-500/10 flex items-center justify-between text-xs text-red-600 dark:text-red-400">
                              <div className="flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span>{uploadError}</span>
                              </div>
                              {selectedFile && (
                                <button
                                  type="button"
                                  onClick={() => uploadFileToServer(selectedFile)}
                                  className="px-2.5 py-1 rounded border border-red-500/40 bg-card hover:bg-muted text-[11px] font-bold text-foreground"
                                >
                                  Retry Upload
                                </button>
                              )}
                            </div>
                          )}

                          {/* Auto-Start AI Pipeline Toggle */}
                          <div className="pt-1 flex items-center gap-2 text-xs">
                            <label className="flex items-center gap-2 cursor-pointer select-none text-muted-foreground hover:text-foreground">
                              <input
                                type="checkbox"
                                checked={autoStartOnUpload}
                                onChange={(e) => setAutoStartOnUpload(e.target.checked)}
                                className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5"
                              />
                              <span className="flex items-center gap-1 font-semibold text-[11px]">
                                <Zap className="w-3.5 h-3.5 text-primary" />
                                Automatically start AI Shorts extraction upon successful upload
                              </span>
                            </label>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mode B: Direct Local Upload */}
          {sourceMode === 'upload' && (
            <div className="space-y-3">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50 bg-muted/20'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                <Upload className="w-8 h-8 mx-auto text-primary mb-2" />
                <p className="text-xs font-bold text-foreground">
                  Drag and drop authorized GTA 6 gameplay recording
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Supports MP4, MOV, WEBM (H.264/AAC, 1080p/4K)
                </p>
              </div>

              {uploading && (
                <div className="space-y-1.5 p-3 rounded-lg border border-border bg-card">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Uploading local source recording...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-150"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {uploadedData && (
                <div className="p-3 rounded-lg border border-border bg-muted/40 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <div>
                      <p className="font-bold text-foreground">{uploadedData.fileName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDuration(uploadedData.duration)} • {uploadedData.width}×{uploadedData.height} • {formatBytes(uploadedData.fileSize)}
                      </p>
                      {uploadedData.checksum && (
                        <p className="text-[10px] font-mono text-muted-foreground truncate max-w-sm">
                          SHA-256: {uploadedData.checksum}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                    VERIFIED STREAM
                  </span>
                </div>
              )}

              {duplicateConfirmation && (
                <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-2.5 text-xs">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-extrabold text-foreground block">
                        Recording Previously Processed
                      </span>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                        This video recording was previously processed in project{' '}
                        <span className="font-bold text-foreground">&quot;{duplicateConfirmation.existingProject.title}&quot;</span>.
                        Do you want to attach it anyway for a new independent project?
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleConfirmDuplicate}
                      className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs shadow-sm transition-colors"
                    >
                      Confirm & Attach Anyway
                    </button>
                    <button
                      type="button"
                      onClick={() => setDuplicateConfirmation(null)}
                      className="px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {uploadError && <p className="text-xs text-rose-500 font-semibold">{uploadError}</p>}
            </div>
          )}
        </div>

        {/* ================= STEP 2: EDITING PREFERENCES ================= */}
        <div className="vice-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[#194350] text-xs font-bold">
              2
            </span>
            <h2 className="font-bold text-sm text-foreground">Editing Preferences</h2>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                Project Title (Optional)
              </label>
              <input
                type="text"
                value={title?.toLowerCase().includes('invalid') ? '' : title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. GTA 6 Vice City Insane Police Chase #01"
                className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
              {/* Duration Preset */}
              <div>
                <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                  Target Length
                </label>
                <div className="grid grid-cols-3 gap-1 bg-muted p-1 rounded-lg border border-border text-xs">
                  {(['15s', '30s', '60s'] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDurationPreset(d)}
                      className={`py-1 rounded font-semibold text-center transition-all ${
                        durationPreset === d
                          ? 'bg-primary text-[#194350] font-bold shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Meme Intensity */}
              <div>
                <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                  Meme Pacing
                </label>
                <select
                  value={memeIntensity}
                  onChange={(e: any) => setMemeIntensity(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-input text-foreground text-xs font-semibold focus:outline-none focus:border-primary"
                >
                  <option value="subtle">Subtle (Key Climax Only)</option>
                  <option value="balanced">Balanced (1-2 per clip)</option>
                  <option value="high">High Energy (Fast cuts)</option>
                </select>
              </div>

              {/* Music Genre */}
              <div>
                <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                  Background Music
                </label>
                <select
                  value={musicStyle}
                  onChange={(e: any) => setMusicStyle(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-input text-foreground text-xs font-semibold focus:outline-none focus:border-primary"
                >
                  <option value="phonk">Vice City Drift (Phonk)</option>
                  <option value="synthwave">Neon Boulevard (Synthwave)</option>
                  <option value="comedy">Funny Glitch (Comedy)</option>
                  <option value="none">Original Streamer Audio Only</option>
                </select>
              </div>

              {/* Subtitles */}
              <div>
                <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                  Animated Subtitles
                </label>
                <select
                  value={subtitleStyle}
                  onChange={(e: any) => setSubtitleStyle(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-input text-foreground text-xs font-semibold focus:outline-none focus:border-primary"
                >
                  <option value="coral_neon">Coral Neon (Pop Style)</option>
                  <option value="soft_peach">Soft Peach (Classic)</option>
                  <option value="clean_white">Clean White (Minimal)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* ================= STEP 3: SUBMIT ================= */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
            <span>Original Streamer Audio & Gameplay 100% Preserved</span>
          </div>

          <button
            type="submit"
            disabled={
              isSubmitting ||
              (sourceMode === 'upload' && !uploadedData && !selectedFile) ||
              (sourceMode === 'youtube' && (!youtubeUrl.trim() || (!uploadedData && !ytMeta?.filePath)))
            }
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] text-[#194350] font-extrabold text-xs shadow-md shadow-[#ff8882]/20 hover:opacity-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Processing Pipeline Active...</span>
              </>
            ) : uploadedData || (sourceMode === 'youtube' && ytMeta?.filePath) ? (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Start Automation</span>
                <ArrowRight className="w-3.5 h-3.5 stroke-[3]" />
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                <span>Attach Recording to Start</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Cancellation Confirmation Dialog */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl text-foreground">
            <div className="flex items-center gap-3 text-red-500 mb-3">
              <StopCircle className="w-6 h-6 shrink-0" />
              <h3 className="text-sm font-extrabold text-foreground">
                Stop Video Processing?
              </h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to cancel the current automated job? This will terminate active rendering processes and cancel remaining AI agents. Previously extracted clips will be preserved.
            </p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelModalOpen(false)}
                disabled={isCancelling}
                className="px-3.5 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                Continue Processing
              </button>
              <button
                type="button"
                onClick={handleCancelJob}
                disabled={isCancelling}
                className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-sm transition-colors"
              >
                {isCancelling ? 'Stopping...' : 'Cancel Job'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

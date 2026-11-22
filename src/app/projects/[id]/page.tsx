'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Film,
  Bot,
  Scissors,
  CheckCircle2,
  Clock,
  Terminal,
  Play,
  Share2,
  AlertCircle,
  ShieldCheck,
  StopCircle,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';

const AGENT_STAGES = [
  { id: 'agent_01_analyzer', name: 'Video Analyzer', role: 'Scene Cuts & Audio Energy' },
  { id: 'agent_02_highlight', name: 'Highlight Detector', role: '10-Category Scoring' },
  { id: 'agent_03_extractor', name: 'Clip Extractor', role: 'Context-Buffered Trimming' },
  { id: 'agent_04_meme', name: 'Meme Researcher', role: 'Certified Reaction Matching' },
  { id: 'agent_05_music', name: 'Music Selector', role: 'Phonk BGM & Ducking Profile' },
  { id: 'agent_06_sfx', name: 'Sound Effects Agent', role: 'Punches, Whooshes & Impacts' },
  { id: 'agent_08_subtitles', name: 'Subtitle Engine', role: 'Word-Level Typography' },
  { id: 'agent_07_editor', name: 'Video Editor', role: '9:16 Vertical Render (1080x1920)' },
  { id: 'agent_09_compliance', name: 'Copyright Compliance', role: 'Asset Ownership & Safety' },
  { id: 'agent_10_qa', name: 'Quality Assurance', role: 'Black Frames & Sync Verification' },
  { id: 'agent_11_export', name: 'Export Engine', role: 'Multi-Platform Packaging' },
];

export default function ProjectDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Cancellation & Retry state
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showTechDetails, setShowTechDetails] = useState(false);

  const fetchProject = async () => {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProject();
    const interval = setInterval(() => {
      fetchProject();
    }, 2500);

    return () => clearInterval(interval);
  }, [id]);

  const handleCancelProject = async () => {
    setIsCancelling(true);
    try {
      const res = await fetch(`/api/projects/${id}/cancel`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json.success) {
        setCancelModalOpen(false);
        fetchProject();
      }
    } catch (err) {
      console.error('Failed to cancel project:', err);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleRetryProject = async () => {
    setIsRetrying(true);
    try {
      const res = await fetch(`/api/projects/${id}/retry`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json.success) {
        fetchProject();
      } else {
        alert(json.error || 'Failed to retry project');
      }
    } catch (err: any) {
      alert(err.message || 'Retry request failed');
    } finally {
      setIsRetrying(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="py-24 text-center space-y-4">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-muted-foreground text-sm">Connecting to AI Agent Swarm...</p>
      </div>
    );
  }

  if (!data?.project) {
    return (
      <div className="py-24 text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
        <h2 className="text-xl font-bold text-foreground">Project Not Found</h2>
        <Link href="/" className="inline-block text-xs text-primary underline">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const { project, clips = [], agentLogs = [], copyrightReport } = data;
  const isCompleted = project.status === 'completed' || project.status === 'ready';
  const isCancelled = project.status === 'cancelled';
  const isActive = project.status === 'in_progress' || project.status === 'created';
  const isError = project.status === 'error' || project.status === 'failed';

  const rawError = project.error_message || project.current_stage || '';
  const shortError = rawError.includes('Vertical render failed')
    ? 'Vertical video rendering encountered an issue while processing stream filters.'
    : rawError.includes('checksum')
    ? 'Source recording checksum verification failed.'
    : rawError.length > 120
    ? rawError.substring(0, 120) + '...'
    : rawError || 'Pipeline encountered an unexpected error.';
  const technicalError = project.error_message || project.current_stage || 'No technical error log available.';

  const renderedClips = clips.filter(
    (c: any) => (c.status === 'rendered' || c.status === 'ready' || c.status === 'completed') && (c.edited_clip_path || c.output_path)
  );
  const failedClips = clips.filter(
    (c: any) => c.status === 'failed' || c.status === 'error' || c.processing_status === 'failed'
  );

  return (
    <div className="space-y-6">
      {/* Back button & quick bar */}
      <div className="flex items-center justify-between">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Projects
        </Link>

        {isActive && (
          <button
            onClick={() => setCancelModalOpen(true)}
            className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-500/20 transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <StopCircle className="w-3.5 h-3.5" /> Cancel Active Job
          </button>
        )}
      </div>

      {/* Top Status Header */}
      <div className="vice-card p-6 md:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/30">
                PROJECT ID: {project.id}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                  isCompleted
                    ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                    : isCancelled
                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                    : isError
                    ? 'bg-rose-500/20 text-rose-700 dark:text-rose-400 border border-rose-500/30'
                    : 'bg-primary/20 text-primary border border-primary/30 animate-pulse'
                }`}
              >
                {project.status.replace('_', ' ')}
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-foreground">{project.title}</h1>
            <p className="text-xs text-muted-foreground">
              Current Stage: <span className="text-primary font-bold uppercase">{project.current_stage}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            {isCompleted && (
              <Link
                href={`/export?project=${project.id}`}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] text-[#194350] font-bold text-xs shadow-md shadow-primary/20 flex items-center gap-1.5 hover:opacity-95"
              >
                <Share2 className="w-3.5 h-3.5" /> Publish Packages
              </Link>
            )}
            {isCancelled && (
              <Link
                href="/projects/new"
                className="px-4 py-2 rounded-xl bg-primary text-[#194350] font-bold text-xs shadow-sm hover:opacity-95"
              >
                Start New Short
              </Link>
            )}
            {isError && (
              <button
                onClick={handleRetryProject}
                disabled={isRetrying}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                {isRetrying ? 'Retrying...' : 'Retry Processing'}
              </button>
            )}
          </div>
        </div>

        {/* Error State Banner */}
        {isError && (
          <div className="p-4 sm:p-5 rounded-2xl border border-rose-500/40 bg-rose-500/10 text-foreground space-y-3 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-500 shrink-0 mt-0.5">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-extrabold text-foreground">Processing Failed</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-600 dark:text-rose-400 uppercase">
                      Stage {project.stage_id || '7'}: {project.current_stage || 'Video Editing'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
                    {shortError}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                <button
                  onClick={handleRetryProject}
                  disabled={isRetrying}
                  className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                  {isRetrying ? 'Retrying...' : 'Retry Processing'}
                </button>
                <button
                  onClick={() => setShowTechDetails(!showTechDetails)}
                  className="px-3 py-2 rounded-xl border border-border bg-card hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  {showTechDetails ? 'Hide Details' : 'View Technical Details'}
                </button>
              </div>
            </div>

            {showTechDetails && (
              <div className="mt-3 p-3.5 rounded-xl bg-black/80 border border-border font-mono text-[11px] text-zinc-300 space-y-2">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2 text-zinc-400">
                  <span>Technical Diagnostics &amp; Stderr Log:</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(technicalError)}
                    className="text-[10px] text-primary hover:underline"
                  >
                    Copy Technical Log
                  </button>
                </div>
                <pre className="whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto text-xs text-rose-400/90 font-mono">
                  {technicalError}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Cancelled Banner */}
        {isCancelled && (
          <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-foreground flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              Processing was cancelled by the user. Active rendering was stopped, temporary resources were released, and any completed clips are preserved.
            </span>
          </div>
        )}

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-semibold text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Bot className="w-4 h-4 text-primary" /> Multi-Agent Execution Progress
            </span>
            <span className="text-foreground font-bold">{project.progress}%</span>
          </div>
          <div className="w-full h-3 bg-muted rounded-full overflow-hidden border border-border">
            <div
              className="h-full bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] transition-all duration-500"
              style={{ width: `${project.progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* 11 Agents Sequential Pipeline Status */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" /> Agent Swarm Orchestration Pipeline
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {AGENT_STAGES.map((agent, index) => {
            const logsForAgent = agentLogs.filter((l: any) => l.agent_id === agent.id);
            const hasRun = logsForAgent.length > 0;
            const isSuccess = logsForAgent.some((l: any) => l.status === 'success' || l.status === 'completed');
            const latestLog = logsForAgent[0];

            return (
              <div
                key={agent.id}
                className={`p-3.5 rounded-xl border transition-all ${
                  isSuccess
                    ? 'border-emerald-500/40 bg-emerald-500/5'
                    : hasRun
                    ? 'border-primary/40 bg-primary/5 animate-pulse'
                    : 'border-border bg-card'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-muted-foreground">
                    STAGE {index + 1}
                  </span>
                  {isSuccess ? (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                      <CheckCircle2 className="w-3 h-3" /> Completed
                    </span>
                  ) : hasRun ? (
                    <span className="text-[10px] text-primary font-semibold animate-pulse">Running</span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">Pending</span>
                  )}
                </div>
                <h4 className="text-xs font-bold text-foreground">{agent.name}</h4>
                <p className="text-[11px] text-muted-foreground">{agent.role}</p>
                {latestLog && (
                  <div className="mt-2 text-[10px] text-muted-foreground font-mono truncate">
                    {latestLog.duration_ms ? `${latestLog.duration_ms}ms • ` : ''}
                    {latestLog.stage || 'done'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Generated Shorts Result Gallery */}
      {renderedClips.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Scissors className="w-4 h-4 text-primary" /> Completed Vertical Shorts ({renderedClips.length})
            </h2>
            <Link href="/editor" className="text-xs font-semibold text-primary hover:underline">
              Open Full Editor &rarr;
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {renderedClips.map((clip: any) => {
              const fileName = clip.output_path ? clip.output_path.split(/\\|\//).pop() : '';
              return (
                <div key={clip.id} className="vice-card overflow-hidden flex flex-col border border-border bg-card">
                  <div className="relative aspect-[9/16] max-h-[440px] bg-black">
                    <video
                      src={`/api/media/clips/${fileName}#t=0.5`}
                      controls
                      preload="metadata"
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-4 space-y-3 bg-card border-t border-border">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground">{clip.title}</span>
                      <span className="text-[10px] text-primary font-bold">{clip.duration.toFixed(1)}s</span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <Link
                        href={`/editor?clip=${clip.id}`}
                        className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1"
                      >
                        <Scissors className="w-3.5 h-3.5" /> Fine-Tune
                      </Link>
                      <Link
                        href={`/export?clip=${clip.id}`}
                        className="px-3 py-1 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 text-xs font-bold border border-primary/30 flex items-center gap-1"
                      >
                        <Share2 className="w-3 h-3" /> Export
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Failed Clips Banner if any render failed */}
      {failedClips.length > 0 && (
        <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-rose-500 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> Rendering Incomplete for {failedClips.length} Clip(s)
            </h3>
            <button
              onClick={handleRetryProject}
              disabled={isRetrying}
              className="text-xs font-bold text-rose-500 hover:underline flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`} /> Retry Render
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            The raw gameplay segments were successfully extracted, but vertical rendering was interrupted. Click &quot;Retry Render&quot; to resume composition with modular fallbacks.
          </p>
        </div>
      )}

      {/* Terminal Agent Logs Stream */}
      <div className="vice-card p-5 space-y-3">
        <div className="flex items-center justify-between text-muted-foreground border-b border-border pb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground uppercase tracking-wider">
            <Terminal className="w-4 h-4 text-primary" /> Live AI Agent Telemetry Stream
          </div>
          <span className="text-[10px] text-muted-foreground">{agentLogs.length} events logged</span>
        </div>

        <div className="bg-muted/70 rounded-xl p-4 font-mono text-xs text-foreground max-h-64 overflow-y-auto space-y-2 border border-border">
          {agentLogs.length === 0 ? (
            <p className="text-muted-foreground italic">Waiting for agent activity...</p>
          ) : (
            agentLogs.map((log: any) => (
              <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                <span className="text-muted-foreground select-none">
                  [{new Date(log.created_at || Date.now()).toLocaleTimeString()}]
                </span>
                <span className="text-primary font-bold">[{log.agent_id ? log.agent_id.replace('agent_', '') : 'system'}]</span>
                <span
                  className={
                    log.status === 'success' || log.status === 'completed'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : log.status === 'running'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-rose-500'
                  }
                >
                  {(log.status || 'OK').toUpperCase()}
                </span>
                <span className="text-foreground">
                  {log.message || log.stage || ''}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

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
              Are you sure you want to stop this automated pipeline? Active rendering processes will be halted and queued agents will be aborted. Completed clips will be saved.
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
                onClick={handleCancelProject}
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

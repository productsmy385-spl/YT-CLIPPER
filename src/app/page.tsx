import React from 'react';
import Link from 'next/link';
import {
  Film,
  Sparkles,
  Scissors,
  CheckCircle2,
  Share2,
  Bot,
  Flame,
  Music,
  Upload,
  ArrowUpRight,
  TrendingUp,
  ShieldCheck,
  Zap,
  Play,
  ArrowRight,
  Activity,
  Layers,
  Cpu,
  Video,
  Eye,
  Radio,
} from 'lucide-react';
import { dbRepo } from '@/db/repository';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const metrics = dbRepo.getDashboardMetrics();
  const projects = dbRepo.listProjects();
  const clips = dbRepo.getAllClips();
  const agents = dbRepo.getAgents();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Studio Dashboard
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            GTA 6 autonomous video editing, highlight detection, and multi-platform publishing.
          </p>
        </div>

        <Link
          href="/projects/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] px-4 py-2 text-xs font-bold text-[#194350] shadow-sm hover:opacity-95 transition-opacity self-start sm:self-auto"
        >
          <Upload className="h-3.5 w-3.5 stroke-[2.5]" />
          Create Short
        </Link>
      </div>

      {/* 4 Minimal Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="vice-card p-4 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
            <span>Projects</span>
            <Film className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-black text-foreground">{metrics.totalProjects}</div>
          <p className="text-[11px] text-muted-foreground font-medium">Source streams analyzed</p>
        </div>

        <div className="vice-card p-4 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
            <span>Viral Shorts</span>
            <Scissors className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-black text-foreground">{metrics.totalClips}</div>
          <p className="text-[11px] text-muted-foreground font-medium">9:16 vertical cuts</p>
        </div>

        <div className="vice-card p-4 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
            <span>QA Pass Rate</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-foreground">{metrics.avgQaScore}%</div>
          <p className="text-[11px] text-muted-foreground font-medium">Zero black frames</p>
        </div>

        <div className="vice-card p-4 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
            <span>AI Fleet</span>
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-black text-foreground">{agents.length}</div>
          <p className="text-[11px] text-muted-foreground font-medium">Specialized workers</p>
        </div>
      </div>

      {/* Main Studio View: Recent Shorts & Projects */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (8 cols): Recent 9:16 Shorts */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm text-foreground flex items-center gap-2">
              <Scissors className="w-4 h-4 text-primary" /> Recent Generated Shorts ({clips.length})
            </h2>
            <Link href="/editor" className="text-xs text-primary font-semibold hover:underline flex items-center gap-0.5">
              Open Editor <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {clips.length === 0 ? (
            <div className="vice-card p-10 text-center space-y-3">
              <Film className="w-10 h-10 text-muted-foreground mx-auto" />
              <p className="text-sm font-semibold text-foreground">No Generated Shorts Yet</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Submit a gameplay stream link or local file to let the AI agents extract highlights.
              </p>
              <Link
                href="/projects/new"
                className="inline-flex px-4 py-2 rounded-lg bg-primary text-[#194350] font-bold text-xs"
              >
                Create Short
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {clips.slice(0, 4).map((clip: any) => {
                const fileName = clip.output_path ? clip.output_path.split(/\\|\//).pop() : '';
                return (
                  <div key={clip.id} className="vice-card overflow-hidden flex flex-col group">
                    <div className="relative aspect-[9/16] max-h-[340px] bg-black">
                      <video
                        src={`/api/media/clips/${fileName}`}
                        controls
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-2 left-2 bg-black/75 px-1.5 py-0.5 rounded text-[10px] font-bold text-primary">
                        9:16 VERTICAL
                      </div>
                      <div className="absolute top-2 right-2 bg-black/75 px-1.5 py-0.5 rounded text-[10px] font-bold text-[#9dbeb8]">
                        {clip.duration.toFixed(1)}s
                      </div>
                    </div>

                    <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2">
                      <div>
                        <h4 className="font-bold text-xs text-foreground group-hover:text-primary transition-colors line-clamp-1">
                          {clip.title}
                        </h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Streamer Audio Preserved • Score: {clip.entertainment_score || 95}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
                        <Link
                          href={`/editor?clip=${clip.id}`}
                          className="font-semibold text-muted-foreground hover:text-primary flex items-center gap-1"
                        >
                          <Scissors className="w-3 h-3" /> Edit
                        </Link>
                        <Link
                          href={`/publishing?publishNow=${clip.id}`}
                          className="px-2.5 py-1 rounded bg-primary/15 text-primary hover:bg-primary/25 font-bold border border-primary/30 flex items-center gap-1"
                        >
                          <Share2 className="w-3 h-3" /> Publish
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column (4 cols): Projects & Quick Links */}
        <div className="lg:col-span-4 space-y-5">
          {/* Active Projects List */}
          <div className="vice-card p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5 text-primary" /> Active Projects
              </h3>
              <span className="text-[10px] text-muted-foreground font-mono">{projects.length} Total</span>
            </div>

            {projects.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No projects in workspace.</p>
            ) : (
              <div className="space-y-2">
                {projects.slice(0, 5).map((p: any) => (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="block p-2.5 rounded-lg border border-border hover:border-primary/40 bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-foreground truncate">{p.title}</span>
                      <span className="text-[10px] font-bold text-[#9dbeb8] shrink-0 ml-2">
                        {p.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
                      <span>Stage: {p.current_stage || 'completed'}</span>
                      <span className="font-mono">{p.progress}%</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Quick Hub Links */}
          <div className="vice-card p-4 space-y-2">
            <h3 className="font-bold text-xs text-foreground border-b border-border pb-2">
              Studio Quick Access
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Link
                href="/highlights"
                className="p-2 rounded-lg border border-border bg-muted/40 hover:border-primary/40 text-foreground font-medium flex items-center gap-1.5"
              >
                <Flame className="w-3.5 h-3.5 text-primary" /> Highlights
              </Link>
              <Link
                href="/publishing"
                className="p-2 rounded-lg border border-border bg-muted/40 hover:border-primary/40 text-foreground font-medium flex items-center gap-1.5"
              >
                <Share2 className="w-3.5 h-3.5 text-[#9dbeb8]" /> Publishing
              </Link>
              <Link
                href="/assets"
                className="p-2 rounded-lg border border-border bg-muted/40 hover:border-primary/40 text-foreground font-medium flex items-center gap-1.5"
              >
                <Music className="w-3.5 h-3.5 text-[#ffc2b4]" /> Asset Vault
              </Link>
              <Link
                href="/agents"
                className="p-2 rounded-lg border border-border bg-muted/40 hover:border-primary/40 text-foreground font-medium flex items-center gap-1.5"
              >
                <Bot className="w-3.5 h-3.5 text-primary" /> AI Agents
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

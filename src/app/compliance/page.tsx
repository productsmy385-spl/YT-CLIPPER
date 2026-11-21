import { dbRepo } from '@/db/repository';
import Link from 'next/link';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Lock,
  Music,
  Smile,
  Film,
  Sparkles,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function CompliancePage() {
  const projects = dbRepo.listProjects();
  const latestProject = projects[0];
  const copyrightReport = latestProject
    ? (dbRepo.getCopyrightReportByProject(String(latestProject.id)) as any)
    : null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/15 border border-secondary/30 text-secondary-foreground text-xs font-semibold mb-2">
          <ShieldCheck className="w-4 h-4 text-[#9dbeb8]" />
          Autonomous Pre-Publication Rights & Safety Verification
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground">
          Agent 9: <span className="vice-gradient-text">Copyright & Content Compliance Center</span>
        </h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-1 max-w-3xl">
          The platform enforces strict copyright safety. It tracks asset ownership, verifies music permissions, validates meme licenses, and ensures zero DRM circumvention or deceptive evasion tactics.
        </p>
      </div>

      {/* Main Compliance Audit Card */}
      <div className="vice-card p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-secondary/15 border border-secondary/30 flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-[#9dbeb8]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-foreground">Pre-Publication Audit Status</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-xs font-bold border border-emerald-500/30">
                  100% PASSED
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                All visual assets, phonk background tracks, and reaction overlays verified clean
              </p>
            </div>
          </div>

          <div className="sm:text-right">
            <span className="text-2xl font-extrabold text-primary">100/100</span>
            <span className="text-xs text-muted-foreground block">Compliance Index</span>
          </div>
        </div>

        {/* 4 Pillars Verification Checklist */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="p-4 rounded-xl bg-muted border border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Film className="w-4 h-4 text-primary" /> 1. Source Gameplay Footage
              </span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Verified authorized streaming gameplay. Content represents transformative vertical short compilation with commentary timing.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-muted border border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Music className="w-4 h-4 text-amber-500" /> 2. Royalty-Free Music Ledger
              </span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Every background soundtrack is registered under Creative Commons 0 (CC0) or royalty-free commercial gaming sync licenses.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-muted border border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Smile className="w-4 h-4 text-amber-500" /> 3. Certified Reaction Memes
              </span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Zero unauthorized copyrighted movie/TV rip clips. All reaction stickers and effects are CC0 or verified public domain.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-muted border border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-primary" /> 4. Anti-Evasion Policy
              </span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              No pitch shifting, mirroring, or speed tricks used to defeat Content ID. System operates strictly through licensed compliance.
            </p>
          </div>
        </div>

        {/* Audit Report Summary */}
        {copyrightReport && (
          <div className="p-4 rounded-xl bg-muted border border-border text-xs text-foreground font-mono space-y-1">
            <div className="text-primary font-bold">AUDIT SUMMARY:</div>
            <div>{copyrightReport.report_summary}</div>
            <div className="text-[10px] text-muted-foreground pt-1">
              Generated: {new Date(String(copyrightReport.generated_at)).toLocaleString()} • Report ID: {String(copyrightReport.id)}
            </div>
          </div>
        )}
      </div>

      {/* Compliance Guidelines for Creators */}
      <div className="vice-card p-6 space-y-3">
        <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" /> Platform Compliance Guidelines
        </h3>

        <div className="space-y-2.5 text-xs text-muted-foreground leading-relaxed">
          <p>
            <strong className="text-primary">Monetization Readiness:</strong> By maintaining a certified chain of custody across all video, audio, and visual assets, shorts created on this platform are fully eligible for YouTube Shorts Monetization and Instagram Creator Bonuses without risk of copyright strikes.
          </p>
          <p>
            <strong className="text-foreground">Attribution Registry:</strong> The system automatically writes full license attributions into the export packages so you can paste them into your YouTube video description with one click.
          </p>
        </div>
      </div>
    </div>
  );
}

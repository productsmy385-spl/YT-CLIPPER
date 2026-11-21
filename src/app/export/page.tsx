'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Share2,
  Download,
  Youtube,
  Copy,
  CheckCircle2,
  Film,
  Sparkles,
  Search,
  X,
  Filter,
} from 'lucide-react';
import { Pagination } from '@/components/ui/pagination';
import { cn } from '@/lib/utils';

function ExportHubContent() {
  const searchParams = useSearchParams();

  const [exportFiles, setExportFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(() => parseInt(searchParams.get('page') || '1', 10));
  const [pageSize, setPageSize] = useState(() => parseInt(searchParams.get('pageSize') || '24', 10));
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [platform, setPlatform] = useState(() => searchParams.get('platform') || 'all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/clips')
      .then((res) => res.json())
      .then((data) => {
        // Collect all exports
        const allExports: any[] = [];
        if (data.clips) {
          data.clips.forEach((c: any) => {
            if (c.exports && Array.isArray(c.exports)) {
              allExports.push(...c.exports);
            }
          });
        }
        setExportFiles(allExports);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Filter exports
  const filteredExports = useMemo(() => {
    return exportFiles.filter((exp) => {
      if (platform !== 'all' && exp.platform !== platform) return false;
      if (search.trim()) {
        const term = search.toLowerCase();
        const matchTitle = exp.title?.toLowerCase().includes(term);
        const matchTags = exp.tags?.toLowerCase().includes(term);
        const matchDesc = exp.description?.toLowerCase().includes(term);
        if (!matchTitle && !matchTags && !matchDesc) return false;
      }
      return true;
    });
  }, [exportFiles, platform, search]);

  const total = filteredExports.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredExports.slice(start, start + pageSize);
  }, [filteredExports, page, pageSize]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-semibold mb-2">
          <Share2 className="w-4 h-4 text-primary" />
          Multi-Platform Packaging &amp; Publishing Hub
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground">
          Agent 11: <span className="vice-gradient-text">Publishing Packages &amp; Metadata</span>
        </h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-1 max-w-3xl">
          Exported 1080×1920 vertical MP4s formatted specifically for YouTube Shorts, Instagram Reels, and TikTok with auto-generated viral titles, descriptions, and hashtags.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="vice-card p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border border-border bg-card">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search export packages by title, hashtags, or tags..."
            className="w-full pl-9 pr-8 py-2 rounded-xl bg-background border border-border text-foreground text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-medium"
          />
          {search && (
            <button
              onClick={() => {
                setSearch('');
                setPage(1);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={platform}
            onChange={(e) => {
              setPlatform(e.target.value);
              setPage(1);
            }}
            className="bg-background border border-border text-foreground text-xs rounded-xl px-3 py-2 font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">All Platforms</option>
            <option value="youtube_shorts">YouTube Shorts</option>
            <option value="instagram_reels">Instagram Reels</option>
            <option value="tiktok">TikTok</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="vice-card p-6 space-y-4 animate-pulse border border-border bg-card">
              <div className="h-6 bg-muted/60 rounded w-1/4" />
              <div className="h-4 bg-muted/40 rounded w-3/4" />
              <div className="h-20 bg-muted/30 rounded" />
            </div>
          ))}
        </div>
      ) : paginatedItems.length === 0 ? (
        <div className="vice-card p-12 text-center space-y-4 border border-border bg-card">
          <Film className="w-12 h-12 text-muted-foreground mx-auto" />
          <h3 className="font-bold text-foreground">No Export Packages Available</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {search || platform !== 'all'
              ? 'No packages match your search filter.'
              : 'Run an analysis project to allow Agent 11 to generate multi-platform publishing packages.'}
          </p>
          <Link href="/projects/new" className="inline-block px-5 py-2.5 rounded-xl bg-primary text-[#194350] font-bold text-xs shadow-sm">
            Start New Project
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {paginatedItems.map((exp: any) => {
            const fileName = exp.file_path ? exp.file_path.split(/\\|\//).pop() : '';
            const platformBadge =
              exp.platform === 'youtube_shorts'
                ? { label: 'YouTube Shorts', color: 'text-primary bg-primary/10 border-primary/30' }
                : exp.platform === 'instagram_reels'
                ? { label: 'Instagram Reels', color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30' }
                : { label: 'TikTok', color: 'text-secondary-foreground bg-secondary/15 border-secondary/30' };

            return (
              <div key={exp.id} className="vice-card p-6 space-y-5 border border-border bg-card text-foreground">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={cn('px-2.5 py-1 rounded-full text-xs font-bold border', platformBadge.color)}>
                      {platformBadge.label}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {((exp.file_size || 0) / (1024 * 1024)).toFixed(2)} MB &bull; 1080×1920 60FPS
                    </span>
                  </div>

                  <a
                    href={`/api/media/exports/${fileName}`}
                    download={fileName}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] text-[#194350] font-bold text-xs flex items-center gap-2 self-start shadow-sm hover:opacity-95 transition-all"
                  >
                    <Download className="w-3.5 h-3.5" /> Download MP4
                  </a>
                </div>

                {/* Metadata Blocks */}
                <div className="space-y-3 bg-muted p-4 rounded-xl border border-border text-xs">
                  <div>
                    <span className="text-[10px] text-primary font-bold uppercase tracking-wider block mb-1">
                      Viral Video Title
                    </span>
                    <div className="flex items-center justify-between font-semibold text-foreground bg-card p-2 rounded-lg border border-border">
                      <span>{exp.title}</span>
                      <button
                        onClick={() => handleCopy(exp.title, `${exp.id}-title`)}
                        className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground text-[10px] flex items-center gap-1 font-mono"
                      >
                        {copiedId === `${exp.id}-title` ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        Copy
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] text-primary font-bold uppercase tracking-wider block mb-1">
                      SEO Video Description &amp; Licensing Attribution
                    </span>
                    <div className="text-foreground bg-card p-2.5 rounded-lg font-mono text-[11px] whitespace-pre-wrap leading-relaxed border border-border relative">
                      {exp.description}
                      <button
                        onClick={() => handleCopy(exp.description, `${exp.id}-desc`)}
                        className="absolute top-2 right-2 p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground text-[10px] flex items-center gap-1 font-mono bg-card border border-border"
                      >
                        {copiedId === `${exp.id}-desc` ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        Copy
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] text-primary font-bold uppercase tracking-wider block mb-1">
                      Platform Hashtags
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {(exp.tags || '').split(' ').map((tag: string, i: number) => (
                        <span key={i} className="px-2 py-0.5 rounded-md bg-card border border-border text-foreground text-[10px] font-semibold">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(p) => setPage(p)}
        onPageSizeChange={(ps) => {
          setPageSize(ps);
          setPage(1);
        }}
        pageSizeOptions={[12, 24, 48, 96]}
        isLoading={loading}
        itemLabel="packages"
      />
    </div>
  );
}

export default function ExportHubPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground">Loading Export Packages...</div>}>
      <ExportHubContent />
    </Suspense>
  );
}

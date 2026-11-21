'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Film, Plus, Clock, CheckCircle2, AlertCircle, ArrowRight, Search, X, MoreVertical, Trash2, AlertTriangle, Flame, Scissors, Layers, Video } from 'lucide-react';
import { Pagination } from '@/components/ui/pagination';
import { cn } from '@/lib/utils';

function ProjectsContent() {
  const searchParams = useSearchParams();

  const [page, setPage] = useState(() => parseInt(searchParams.get('page') || '1', 10));
  const [pageSize, setPageSize] = useState(() => parseInt(searchParams.get('pageSize') || '24', 10));
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [status, setStatus] = useState(() => searchParams.get('status') || 'all');
  const [sort, setSort] = useState(() => searchParams.get('sort') || 'newest');

  const [projects, setProjects] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Deletion state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<any | null>(null);
  const [deleteSourceOption, setDeleteSourceOption] = useState(false);
  const [deleteClipsOption, setDeleteClipsOption] = useState(false);
  const [deletePermanent, setDeletePermanent] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const handleClickOutside = () => setOpenMenuId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const handleDeleteProject = async () => {
    if (!deleteProjectTarget) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: deleteProjectTarget.id,
          deleteSource: deleteSourceOption,
          deleteClips: deleteClipsOption,
          permanent: deletePermanent,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDeleteProjectTarget(null);
        fetchProjects();
      } else {
        alert(data.error || 'Failed to delete project');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (search.trim()) params.set('search', search.trim());
      if (status !== 'all') params.set('status', status);
      if (sort !== 'newest') params.set('sort', sort);

      const res = await fetch(`/api/projects?${params.toString()}`);
      const data = await res.json();

      if (data.projects) {
        setProjects(data.projects);
        setTotal(data.pagination?.total || data.projects.length);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, status, sort]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Sync state to URL
  useEffect(() => {
    const url = new URL(window.location.href);
    if (page > 1) url.searchParams.set('page', String(page));
    else url.searchParams.delete('page');

    if (pageSize !== 24) url.searchParams.set('pageSize', String(pageSize));
    else url.searchParams.delete('pageSize');

    if (search.trim()) url.searchParams.set('search', search.trim());
    else url.searchParams.delete('search');

    if (status !== 'all') url.searchParams.set('status', status);
    else url.searchParams.delete('status');

    window.history.replaceState({}, '', url.toString());
  }, [page, pageSize, search, status]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
            <Film className="w-5 h-5 text-primary" />
            Projects Library
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            All ingested gameplay streams, recordings, and multi-agent editing pipelines.
          </p>
        </div>

        <Link
          href="/projects/new"
          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] px-4 py-2 text-xs font-bold text-[#194350] shadow-sm hover:opacity-95 transition-opacity self-start sm:self-auto"
        >
          <Plus className="h-3.5 w-3.5 stroke-[3]" />
          New Project
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <div className="vice-card p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border border-border bg-card">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search projects by title, ID, or source URL..."
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
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="bg-background border border-border text-foreground text-xs rounded-xl px-3 py-2 font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">All Statuses</option>
            <option value="ready">Ready / Completed</option>
            <option value="created">Created / Pending</option>
            <option value="analyzing">Analyzing</option>
            <option value="editing">Editing</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
            className="bg-background border border-border text-foreground text-xs rounded-xl px-3 py-2 font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="title">Title (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Projects Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="vice-card p-5 space-y-4 border border-border bg-card animate-pulse">
              <div className="h-4 bg-muted/60 rounded w-1/3" />
              <div className="h-5 bg-muted/60 rounded w-3/4" />
              <div className="h-3 bg-muted/40 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="vice-card p-12 text-center space-y-3 border border-border bg-card">
          <Film className="w-10 h-10 text-muted-foreground mx-auto" />
          <h3 className="font-bold text-sm text-foreground">No Projects Found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {search || status !== 'all'
              ? 'No projects match your search or status filter. Try resetting your query.'
              : 'Create your first GTA 6 Shorts project by providing a YouTube stream link or uploading a video file.'}
          </p>
          <Link
            href="/projects/new"
            className="inline-flex px-4 py-2 rounded-xl bg-primary text-[#194350] font-bold text-xs"
          >
            Create Short
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p: any) => {
            const isCompleted = p.status === 'completed' || p.status === 'ready';
            const isCancelled = p.status === 'cancelled';

            return (
              <div
                key={p.id}
                className="vice-card p-4 sm:p-5 flex flex-col justify-between space-y-4 hover:border-primary/40 transition-colors border border-border bg-card"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                      {p.id}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'text-[10px] font-bold px-2 py-0.5 rounded uppercase',
                          isCancelled
                            ? 'bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30'
                            : isCompleted
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                            : 'bg-primary/15 text-primary border border-primary/30 animate-pulse'
                        )}
                      >
                        {p.status}
                      </span>

                      {/* Three dot actions */}
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(openMenuId === p.id ? null : p.id);
                          }}
                          className="w-7 h-7 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                          title="Project Options"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>

                        {openMenuId === p.id && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 top-8 w-44 rounded-xl bg-card border border-border shadow-xl p-1 z-50 text-xs animate-fade-in"
                          >
                            <Link
                              href={`/projects/${p.id}`}
                              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground flex items-center gap-2"
                            >
                              <Film className="w-3.5 h-3.5 text-primary" /> View Pipeline
                            </Link>

                            <Link
                              href={`/highlights?projectId=${p.id}`}
                              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground flex items-center gap-2"
                            >
                              <Flame className="w-3.5 h-3.5 text-primary" /> View Highlights
                            </Link>

                            <Link
                              href={`/editor?projectId=${p.id}`}
                              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground flex items-center gap-2"
                            >
                              <Scissors className="w-3.5 h-3.5 text-primary" /> Open in Editor
                            </Link>

                            <div className="my-1 border-t border-border" />

                            <button
                              onClick={() => {
                                setDeleteProjectTarget(p);
                                setDeleteSourceOption(false);
                                setDeleteClipsOption(true);
                                setDeletePermanent(false);
                                setOpenMenuId(null);
                              }}
                              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-rose-500/10 text-rose-500 flex items-center gap-2 font-semibold"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete Project
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <h3 className="font-bold text-sm text-foreground line-clamp-1">{p.title}</h3>
                  <p className="text-[11px] text-muted-foreground line-clamp-1">
                    {p.source_url ? `Stream: ${p.source_url}` : `File: ${p.source_file || 'Local Upload'}`}
                  </p>
                </div>

                {/* Genuine Project Metrics */}
                <div className="grid grid-cols-3 gap-2 p-2 rounded-xl bg-muted/40 border border-border text-center text-xs">
                  <div>
                    <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Highlights</span>
                    <span className="font-mono text-primary font-bold">{p.highlightsCount ?? 0}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Extracted</span>
                    <span className="font-mono text-foreground font-bold">{p.extractedClipsCount ?? 0}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block uppercase font-semibold">9:16 Shorts</span>
                    <span className="font-mono text-[#9dbeb8] font-bold">{p.editedClipsCount ?? 0}</span>
                  </div>
                </div>

                <div className="space-y-2.5 pt-1 border-t border-border">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Stage: <strong className="text-foreground">{p.current_stage || 'Done'}</strong>
                    </span>
                    <span className="font-mono text-primary font-bold">{p.progress}%</span>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    <Link
                      href={`/projects/${p.id}`}
                      className="py-1.5 px-2 rounded-lg bg-muted hover:bg-muted/80 border border-border text-[11px] font-bold flex items-center justify-center gap-1 text-foreground transition-colors"
                      title="View Multi-Agent Pipeline"
                    >
                      <Film className="w-3 h-3 text-primary" /> Pipeline
                    </Link>
                    <Link
                      href={`/highlights?projectId=${p.id}`}
                      className="py-1.5 px-2 rounded-lg bg-muted hover:bg-muted/80 border border-border text-[11px] font-bold flex items-center justify-center gap-1 text-foreground transition-colors"
                      title="View Highlights"
                    >
                      <Flame className="w-3 h-3 text-primary" /> Highlights
                    </Link>
                    <Link
                      href={`/editor?projectId=${p.id}`}
                      className="py-1.5 px-2 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/20 text-[11px] font-bold flex items-center justify-center gap-1 text-primary transition-colors"
                      title="Open in 9:16 Video Editor"
                    >
                      <Scissors className="w-3 h-3" /> Editor
                    </Link>
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
        itemLabel="projects"
      />

      {/* Delete Project Confirmation Modal */}
      {deleteProjectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-scale-in">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-base text-foreground">Delete Project?</h3>
                <p className="text-xs text-muted-foreground">
                  You are about to delete project <strong className="text-foreground">{deleteProjectTarget.title}</strong> ({deleteProjectTarget.id}).
                </p>
              </div>
            </div>

            {/* Source video options */}
            <div className="p-3.5 rounded-xl bg-muted/50 border border-border space-y-3 text-xs">
              <span className="font-bold text-foreground block">Deletion Scope:</span>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteClipsOption}
                  onChange={(e) => setDeleteClipsOption(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary mt-0.5"
                />
                <span className="text-muted-foreground text-[11px] leading-relaxed">
                  <strong className="text-foreground">Delete All Generated Clips &amp; Exports</strong>: Also remove all extracted highlights, vertical shorts, and export files created under this project.
                </span>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteSourceOption}
                  onChange={(e) => setDeleteSourceOption(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary mt-0.5"
                />
                <span className="text-muted-foreground text-[11px] leading-relaxed">
                  <strong className="text-foreground">Delete Original Source Video</strong>: Also delete the original source gameplay recording from disk.
                </span>
              </label>

              <div className="border-t border-border pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-rose-500 font-semibold text-[11px]">
                  <input
                    type="checkbox"
                    checked={deletePermanent}
                    onChange={(e) => setDeletePermanent(e.target.checked)}
                    className="rounded border-border text-rose-500 focus:ring-rose-500"
                  />
                  <span>Permanently purge immediately (skip 30-day Trash)</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteProjectTarget(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold border border-border transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteProject}
                disabled={deleting}
                className="px-4 py-2 rounded-xl bg-rose-500 text-white hover:bg-rose-600 text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                {deleting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{deletePermanent ? 'Delete Permanently' : 'Move to Trash'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectsIndexPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground">Loading Projects...</div>}>
      <ProjectsContent />
    </Suspense>
  );
}

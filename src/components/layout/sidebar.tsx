'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Flame,
  LayoutDashboard,
  FolderKanban,
  Upload,
  Scissors,
  Share2,
  Download,
  ShieldCheck,
  Bot,
  Music,
  Smile,
  Volume2,
  Calendar,
  CheckCircle2,
  Settings,
  Plus,
  Radio,
  HardDrive,
  Cpu,
  X,
  Activity,
  Trash2,
  Film,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  badgeVariant?: 'coral' | 'peach' | 'seafoam' | 'spruce';
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: 'STUDIO',
    items: [
      { title: 'Create Shorts', href: '/', icon: Upload },
      { title: 'Projects', href: '/projects', icon: FolderKanban },
      { title: 'Video Editor', href: '/editor', icon: Scissors },
    ],
  },
  {
    label: 'LIBRARY',
    items: [
      { title: 'Media Library', href: '/library', icon: Film },
      { title: 'Music', href: '/assets?tab=music', icon: Music },
      { title: 'Trash', href: '/media?tab=trash', icon: Trash2 },
    ],
  },
  {
    label: 'PUBLISHING',
    items: [
      { title: 'Publishing Center', href: '/publishing', icon: Share2 },
      { title: 'Scheduled Posts', href: '/publishing?tab=scheduled', icon: Calendar },
      { title: 'Published', href: '/publishing?tab=history', icon: CheckCircle2 },
    ],
  },
];

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  const isRouteActive = (href: string) => {
    const baseHref = href.split('?')[0];
    if (href === '/') return pathname === '/';
    return pathname === baseHref;
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity"
        />
      )}

      {/* Side Panel */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-card text-foreground transition-all duration-200 lg:static lg:translate-x-0 shadow-sm',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-border px-5 bg-card">
          <Link href="/" onClick={onClose} className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#ff8882] to-[#ffc2b4] p-0.5 shadow-sm group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-[#194350] rounded-[6px] flex items-center justify-center">
                <Flame className="w-4 h-4 text-[#ff8882]" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 leading-none">
                <span className="font-extrabold text-sm tracking-tight text-foreground">GTA VI</span>
                <span className="text-[10px] bg-primary/15 text-primary font-bold px-1 py-0.2 rounded border border-primary/30">
                  AI SHORTS
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mt-0.5">
                Gaming Studio
              </p>
            </div>
          </Link>

          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Action Button & Status Bar */}
        <div className="p-3 space-y-2 border-b border-border">
          <Link
            href="/"
            onClick={onClose}
            className="flex items-center justify-center gap-1.5 w-full py-2 px-3 rounded-lg bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] text-[#194350] font-bold text-xs shadow-sm hover:opacity-95 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            Create Short
          </Link>

        </div>

        {/* Clean Navigation Menus */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {navGroups.map((group) => (
            <div key={group.label} className="space-y-0.5">
              <div className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                {group.label}
              </div>

              {group.items.map((item) => {
                const active = isRouteActive(item.href);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      'flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors duration-150',
                      active
                        ? 'bg-primary/10 text-primary border border-primary/20 shadow-sm font-bold'
                        : 'text-foreground/80 hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
                      <span>{item.title}</span>
                    </div>

                    {item.badge && (
                      <span className="rounded px-1.5 py-0.2 text-[10px] font-bold bg-muted text-muted-foreground border border-border">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

      </aside>
    </>
  );
}

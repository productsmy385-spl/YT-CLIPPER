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
      {
        title: 'Dashboard',
        href: '/',
        icon: LayoutDashboard,
      },
      {
        title: 'Media Library',
        href: '/library',
        icon: Film,
        badge: 'Vault',
        badgeVariant: 'seafoam',
      },
      {
        title: 'Projects',
        href: '/projects',
        icon: FolderKanban,
      },
      {
        title: 'Create Shorts',
        href: '/projects/new',
        icon: Upload,
        badge: 'New',
        badgeVariant: 'coral',
      },
      {
        title: 'Highlights',
        href: '/highlights',
        icon: Flame,
      },
      {
        title: 'Publishing Center',
        href: '/publishing',
        icon: Share2,
        badge: 'Live',
        badgeVariant: 'coral',
      },
      {
        title: 'Content Rights',
        href: '/rights',
        icon: ShieldCheck,
        badge: 'Verified',
        badgeVariant: 'seafoam',
      },
    ],
  },
  {
    label: 'EDITING',
    items: [
      {
        title: 'Video Editor',
        href: '/editor',
        icon: Scissors,
      },
      {
        title: 'Media Library',
        href: '/media',
        icon: Film,
      },
    ],
  },
  {
    label: 'ASSETS',
    items: [
      {
        title: 'Meme Sounds',
        href: '/assets?tab=memes',
        icon: Smile,
        badge: '1044',
        badgeVariant: 'seafoam',
      },
      {
        title: 'Music Library',
        href: '/assets?tab=music',
        icon: Music,
      },
      {
        title: 'Sound Effects',
        href: '/assets?tab=sfx',
        icon: Volume2,
      },
    ],
  },
  {
    label: 'AI SYSTEM',
    items: [
      {
        title: 'AI Agents',
        href: '/agents',
        icon: Bot,
        badge: '11 Online',
        badgeVariant: 'seafoam',
      },
      {
        title: 'Processing Jobs',
        href: '/projects',
        icon: Activity,
      },
    ],
  },
  {
    label: 'PUBLISHING',
    items: [
      {
        title: 'Publishing Center',
        href: '/publishing',
        icon: Share2,
      },
      {
        title: 'Scheduled Posts',
        href: '/publishing?tab=scheduled',
        icon: Calendar,
      },
      {
        title: 'Published',
        href: '/publishing?tab=history',
        icon: CheckCircle2,
      },
    ],
  },
  {
    label: 'MANAGEMENT',
    items: [
      {
        title: 'Trash',
        href: '/media?tab=trash',
        icon: Trash2,
      },
      {
        title: 'Settings & Rights',
        href: '/compliance',
        icon: Settings,
      },
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
            href="/projects/new"
            onClick={onClose}
            className="flex items-center justify-center gap-1.5 w-full py-2 px-3 rounded-lg bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] text-[#194350] font-bold text-xs shadow-sm hover:opacity-95 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            Create Short
          </Link>

          <div className="flex items-center justify-between px-2.5 py-1 rounded-md bg-muted/70 text-[11px] font-medium text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#9dbeb8] animate-pulse" />
              <span>11 Agents Active</span>
            </div>
            <span className="text-primary font-bold text-[10px]">LIVE</span>
          </div>
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

        {/* Side Panel Footer */}
        <div className="border-t border-border p-3 text-[11px] text-muted-foreground space-y-1 bg-card">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Cpu className="w-3 h-3 text-primary" /> Render Engine
            </span>
            <span className="font-medium text-foreground">1080×1920 60FPS</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Volume2 className="w-3 h-3 text-secondary" /> Audio Mode
            </span>
            <span className="font-medium text-foreground">Streamer Voice Safe</span>
          </div>
        </div>
      </aside>
    </>
  );
}

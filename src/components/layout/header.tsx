'use client';

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  Menu,
  Search,
  Bell,
  Maximize2,
  Sparkles,
  Zap,
} from 'lucide-react';
import { Breadcrumb } from './breadcrumb';
import { UserMenu } from './user-menu';
import { ThemeToggle } from '../theme-toggle';

interface HeaderProps {
  onToggleSidebar: () => void;
}

export function Header({ onToggleSidebar }: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const actionButton =
    'flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary cursor-pointer';

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 px-4 backdrop-blur-md lg:px-6 transition-colors duration-200">
      <div className="flex h-16 items-center justify-between gap-4">
        {/* Left: Mobile Toggle & Breadcrumb */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSidebar}
            className={cn(actionButton, 'lg:hidden')}
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="hidden sm:block">
            <Breadcrumb />
          </div>
        </div>

        {/* Center: Search Bar */}
        <div className="flex-1 max-w-md mx-2">
          {searchOpen ? (
            <div className="flex h-9 w-full items-center gap-2 rounded-lg border border-primary/50 bg-card px-3 shadow-sm ring-2 ring-primary/20">
              <Search className="h-4 w-4 text-primary shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search clips, highlights, audio tracks..."
                className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                autoFocus
                onBlur={() => setSearchOpen(false)}
                onKeyDown={(e) => e.key === 'Escape' && setSearchOpen(false)}
              />
            </div>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-foreground cursor-pointer"
            >
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="hidden sm:inline flex-1 text-left truncate">
                Search clips, highlights, audio tracks...
              </span>
              <kbd className="hidden sm:inline rounded-md border border-border bg-muted px-1.5 py-0.5 text-2xs font-semibold text-foreground">
                Ctrl K
              </kbd>
            </button>
          )}
        </div>

        {/* Right: Actions, Theme Toggle & User */}
        <div className="flex items-center gap-2">
          {/* Live Engine Indicator */}
          <div className="hidden xl:flex items-center gap-2 px-3 py-1 rounded-full bg-muted border border-border text-xs font-semibold">
            <Zap className="w-3 h-3 text-primary animate-pulse" />
            <span className="text-foreground text-[11px]">Autonomous Studio</span>
          </div>

          <ThemeToggle />

          <button
            onClick={() => {
              if (!document.fullscreenElement) document.documentElement.requestFullscreen();
              else document.exitFullscreen();
            }}
            className={cn(actionButton, 'hidden md:flex')}
            aria-label="Toggle fullscreen"
          >
            <Maximize2 className="h-4 w-4" />
          </button>

          <button className={cn(actionButton, 'relative')} aria-label="Notifications">
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-card bg-primary" />
          </button>

          <UserMenu />
        </div>
      </div>
    </header>
  );
}

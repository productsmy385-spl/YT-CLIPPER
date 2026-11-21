'use client';

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  ChevronDown,
  ShieldCheck,
  User,
  Settings,
  Sparkles,
  CheckCircle2,
  LogOut,
  Camera,
} from 'lucide-react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { ProfileSettingsModal } from '@/components/profile/profile-settings-modal';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string | null;
  initials: string;
}

export function UserMenu() {
  const [open, setOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile>({
    id: 'usr_creator_01',
    name: 'Vice City Studios',
    email: 'creator@vicecity.io',
    role: 'Studio Director',
    avatarUrl: null,
    initials: 'VC',
  });

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/profile');
      const data = await res.json();
      if (data.success && data.user) {
        setProfile(data.user);
      }
    } catch {
      // Keep initial default
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleSignOut = () => {
    setOpen(false);
    if (confirm('Sign out of GTA 6 Shorts AI Studio?')) {
      window.location.href = '/';
    }
  };

  return (
    <>
      <div ref={rootRef} className="relative ml-1">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(!open)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Open user menu"
          className="flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-2 text-foreground shadow-sm transition-colors hover:border-primary/50 hover:bg-primary/5 cursor-pointer"
        >
          <Avatar
            src={profile.avatarUrl}
            name={profile.name}
            initials={profile.initials}
            size="xs"
            className="ring-1 ring-border"
          />
          <span className="hidden text-left md:block">
            <span className="block text-xs font-bold leading-none text-foreground truncate max-w-[120px]">
              {profile.name}
            </span>
            <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
              <ShieldCheck className="h-3 w-3 text-primary" />
              {profile.role || 'Verified Creator'}
            </span>
          </span>
          <ChevronDown
            className={cn(
              'hidden h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 sm:block',
              open && 'rotate-180'
            )}
          />
        </button>

        {open && (
          <div
            role="menu"
            aria-label="User menu"
            className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-border bg-card p-1.5 shadow-xl animate-fade-in text-foreground"
          >
            {/* User Details Header */}
            <div className="flex items-center gap-3 border-b border-border p-2.5">
              <Avatar
                src={profile.avatarUrl}
                name={profile.name}
                initials={profile.initials}
                size="md"
                className="ring-2 ring-primary/30"
              />
              <div className="flex-1 min-w-0">
                <p className="truncate text-xs font-bold text-foreground">{profile.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{profile.email}</p>
                <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.2 rounded border border-primary/20">
                  <ShieldCheck className="w-2.5 h-2.5" />
                  {profile.role || 'Studio Creator'}
                </span>
              </div>
            </div>

            {/* Menu Items */}
            <div className="py-1 space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setProfileModalOpen(true);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                <Camera className="h-3.5 w-3.5 text-primary" />
                <span>Profile & Avatar Settings</span>
              </button>

              <Link
                href="/projects/new"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5 text-secondary" />
                <span>Create New Shorts</span>
              </Link>

              <Link
                href="/publishing"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                <span>Connected Channels</span>
              </Link>

              <Link
                href="/compliance"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-secondary" />
                <span>Rights & Compliance</span>
              </Link>
            </div>

            <div className="border-t border-border pt-1 mt-1">
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <ProfileSettingsModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        onProfileUpdated={fetchProfile}
      />
    </>
  );
}

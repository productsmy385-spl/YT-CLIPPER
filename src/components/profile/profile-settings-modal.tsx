'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Trash2, Camera, Check, AlertCircle, ShieldCheck } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';

interface ProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdated?: () => void;
}

export function ProfileSettingsModal({
  isOpen,
  onClose,
  onProfileUpdated,
}: ProfileSettingsModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [initials, setInitials] = useState('VC');

  // Load current user data on open
  useEffect(() => {
    if (isOpen) {
      loadProfile();
    }
  }, [isOpen]);

  const loadProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/profile');
      const data = await res.json();
      if (data.success && data.user) {
        setName(data.user.name || '');
        setEmail(data.user.email || '');
        setRole(data.user.role || 'Studio Director');
        setAvatarUrl(data.user.avatarUrl || null);
        setInitials(data.user.initials || 'VC');
      }
    } catch (err: any) {
      setError('Failed to load profile data.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please choose a valid image file (PNG, JPG, WebP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB in size.');
      return;
    }

    setUploadingAvatar(true);
    setError(null);
    setSuccessMsg(null);

    const formData = new FormData();
    formData.append('avatar', file);

    try {
      const res = await fetch('/api/profile/avatar', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setAvatarUrl(data.avatarUrl);
        setSuccessMsg('Profile photograph updated successfully.');
        if (onProfileUpdated) onProfileUpdated();
      } else {
        setError(data.error || 'Failed to upload photograph.');
      }
    } catch {
      setError('Network error during avatar upload.');
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = async () => {
    setUploadingAvatar(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/profile/avatar', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setAvatarUrl(null);
        setSuccessMsg('Profile photograph removed.');
        if (onProfileUpdated) onProfileUpdated();
      } else {
        setError(data.error || 'Failed to remove photograph.');
      }
    } catch {
      setError('Network error removing avatar.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role, avatarUrl }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg('Profile changes saved successfully.');
        if (onProfileUpdated) onProfileUpdated();
        setTimeout(() => onClose(), 800);
      } else {
        setError(data.error || 'Failed to save changes.');
      }
    } catch {
      setError('Network error saving profile changes.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div>
            <h3 className="text-base font-extrabold text-foreground">Profile & Avatar Settings</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage your studio creator identity and photograph
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Feedback messages */}
        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSaveProfile} className="mt-5 space-y-5">
          {/* Avatar Section */}
          <div className="flex items-center gap-4 p-4 rounded-xl border border-border bg-muted/40">
            <div className="relative group">
              <Avatar
                src={avatarUrl}
                name={name}
                initials={initials}
                size="lg"
                className="ring-2 ring-primary/40 ring-offset-2 ring-offset-card"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                title="Change photograph"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 space-y-1.5">
              <p className="text-xs font-bold text-foreground">Profile Photograph</p>
              <p className="text-[11px] text-muted-foreground">
                PNG, JPG or WebP up to 5MB.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="px-2.5 py-1 rounded-md text-xs font-semibold bg-primary text-[#194350] hover:opacity-90 transition-opacity flex items-center gap-1 shadow-sm"
                >
                  <Upload className="w-3 h-3" />
                  {uploadingAvatar ? 'Uploading...' : 'Upload Photo'}
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    disabled={uploadingAvatar}
                    className="px-2.5 py-1 rounded-md text-xs font-semibold border border-border text-muted-foreground hover:text-red-500 hover:border-red-500/30 transition-colors flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* User Fields */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                Full Display Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. Vice City Studios"
                className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="e.g. creator@vicecity.io"
                className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                Account Role
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Studio Director"
                  className="flex-1 px-3 py-2 rounded-lg border border-border bg-input text-foreground text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <span className="inline-flex items-center gap-1 px-2 py-2 rounded-lg bg-secondary/15 text-secondary-foreground text-2xs font-bold border border-secondary/30 shrink-0">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#9dbeb8]" />
                  Verified
                </span>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || loading}
              className="px-4 py-2 rounded-lg bg-primary text-[#194350] font-bold text-xs shadow-sm hover:opacity-95 transition-opacity"
            >
              {saving ? 'Saving...' : 'Save Profile Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

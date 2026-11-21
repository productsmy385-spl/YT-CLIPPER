'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Music,
  Smile,
  Volume2,
  ShieldCheck,
  Play,
  FileCheck,
  Search,
  Sparkles,
} from 'lucide-react';

function AssetVaultContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'memes';

  const [activeTab, setActiveTab] = useState<'memes' | 'music' | 'sfx'>(
    (initialTab as any) || 'memes'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [assets, setAssets] = useState<{
    memes: any[];
    music: any[];
    sfx: any[];
  }>({
    memes: [],
    music: [],
    sfx: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/assets')
      .then((res) => res.json())
      .then((data) => {
        setAssets({
          memes: data.memes || [],
          music: data.music || [],
          sfx: data.sfx || [],
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filteredMemes = assets.memes.filter((m) =>
    m.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.emotion?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredMusic = assets.music.filter((m) =>
    m.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.genre?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSfx = assets.sfx.filter((s) =>
    s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
            <Music className="w-5 h-5 text-primary" />
            Asset Vault
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pre-cleared meme sound files (1044 assets), royalty-free music, and sound effects library.
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search audio assets..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-card text-xs text-foreground focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-2 text-xs font-bold">
        <button
          onClick={() => setActiveTab('memes')}
          className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
            activeTab === 'memes'
              ? 'bg-primary text-[#194350] shadow-sm font-bold'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Smile className="w-3.5 h-3.5" />
          Meme Sounds ({assets.memes.length})
        </button>
        <button
          onClick={() => setActiveTab('music')}
          className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
            activeTab === 'music'
              ? 'bg-primary text-[#194350] shadow-sm font-bold'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Music className="w-3.5 h-3.5" />
          Music Library ({assets.music.length})
        </button>
        <button
          onClick={() => setActiveTab('sfx')}
          className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
            activeTab === 'sfx'
              ? 'bg-primary text-[#194350] shadow-sm font-bold'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Volume2 className="w-3.5 h-3.5" />
          Sound Effects ({assets.sfx.length})
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-xs text-muted-foreground">Loading audio asset vault...</div>
      ) : (
        <div>
          {/* TAB 1: MEME SOUNDS */}
          {activeTab === 'memes' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredMemes.map((m) => (
                  <div key={m.id} className="vice-card p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded uppercase">
                        {m.emotion || 'Reaction'}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">{m.duration ? m.duration.toFixed(1) : '1.2'}s</span>
                    </div>
                    <h3 className="font-bold text-xs text-foreground truncate">{m.name}</h3>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border">
                      <span>Type: <strong className="text-foreground">{m.overlayType || 'SFX Ducking'}</strong></span>
                      <span className="text-[#9dbeb8] font-medium">Licensed Safe</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: MUSIC LIBRARY */}
          {activeTab === 'music' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredMusic.map((mus) => {
                const fileName = mus.filePath ? mus.filePath.split(/\\|\//).pop() : '';
                return (
                  <div key={mus.id} className="vice-card p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-xs text-foreground">{mus.title}</h3>
                        <p className="text-[10px] text-primary font-medium uppercase tracking-wider">
                          {mus.genre} • {mus.bpm} BPM
                        </p>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">{mus.duration.toFixed(1)}s</span>
                    </div>

                    <audio
                      src={`/api/media/music/${fileName}`}
                      controls
                      preload="none"
                      className="w-full h-8 accent-[#ff8882]"
                    />

                    <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border">
                      <span>Energy: <strong className="text-foreground">{mus.energy}</strong></span>
                      <span className="text-[#9dbeb8] font-medium flex items-center gap-1">
                        <FileCheck className="w-3 h-3 text-primary" /> Commercial Sync Safe
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 3: SOUND EFFECTS */}
          {activeTab === 'sfx' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filteredSfx.map((s) => {
                const fileName = s.filePath ? s.filePath.split(/\\|\//).pop() : '';
                return (
                  <div key={s.id} className="vice-card p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.2 rounded uppercase">
                        {s.category || 'SFX'}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">{s.duration ? s.duration.toFixed(1) : '0.8'}s</span>
                    </div>
                    <h4 className="font-semibold text-xs text-foreground truncate">{s.name}</h4>
                    <audio
                      src={`/api/media/sfx/${fileName}`}
                      controls
                      preload="none"
                      className="w-full h-6 accent-[#9dbeb8]"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AssetVaultPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-xs text-muted-foreground">Loading assets...</div>}>
      <AssetVaultContent />
    </Suspense>
  );
}

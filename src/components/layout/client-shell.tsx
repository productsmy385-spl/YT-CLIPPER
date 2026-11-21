'use client';

import React, { useState } from 'react';
import { Sidebar } from './sidebar';
import { Header } from './header';

export function ClientShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground font-sans antialiased selection:bg-primary/20 selection:text-foreground transition-colors duration-150">
      {/* Left Side Panel */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area with Header */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Header onToggleSidebar={() => setSidebarOpen((prev) => !prev)} />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-background transition-colors duration-150">
          <div className="max-w-7xl mx-auto w-full space-y-6">
            {children}
          </div>

          {/* Clean Footer */}
          <footer className="mt-12 border-t border-border pt-6 pb-8 text-center text-2xs text-muted-foreground">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-bold text-foreground">GTA 6 Shorts AI Studio</span>
                <span>•</span>
                <span>100% Authorized & Certified Content Pipeline</span>
              </div>
              <div>
                Zero DRM Circumvention • 1080×1920 60FPS FFmpeg Engine • Autonomous Video Composition
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}

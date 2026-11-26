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
      <div className="flex flex-1 flex-col overflow-hidden min-w-0 bg-background transition-colors duration-150">
        <Header onToggleSidebar={() => setSidebarOpen((prev) => !prev)} />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-background transition-colors duration-150">
          <div className="max-w-7xl mx-auto w-full space-y-6">
            {children}
          </div>

        </main>
      </div>
    </div>
  );
}

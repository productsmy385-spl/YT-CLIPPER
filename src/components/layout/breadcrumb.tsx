'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';

const routeLabels: Record<string, string> = {
  projects: 'Projects',
  new: 'Create Short & Upload',
  editor: 'Shorts Editor',
  highlights: 'Highlight Detection',
  publishing: 'Publishing Center',
  export: 'Export Hub',
  compliance: 'Copyright & Compliance',
  assets: 'Asset Vault',
  agents: '11 AI Agents Fleet',
};

export function Breadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) {
    return (
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-2xs text-[#9dbeb8]">
        <span className="flex items-center gap-1 font-semibold text-[#f4f8f8]">
          <Home className="h-3.5 w-3.5 text-[#ff8882]" />
          <span>Dashboard</span>
        </span>
      </nav>
    );
  }

  const breadcrumbs = segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/');
    const label = routeLabels[segment] || segment.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const isLast = index === segments.length - 1;

    return { label, href, isLast };
  });

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-2xs text-[#9dbeb8]">
      <Link
        href="/"
        aria-label="Home"
        className="flex items-center gap-1 transition-colors hover:text-[#ff8882]"
      >
        <Home className="h-3.5 w-3.5 text-[#9dbeb8] hover:text-[#ff8882] transition-colors" />
        <span className="hidden sm:inline">Dashboard</span>
      </Link>
      {breadcrumbs.map((crumb) => (
        <span key={crumb.href} className="flex items-center gap-1.5">
          <ChevronRight className="h-3 w-3 text-[#1d4551]" aria-hidden="true" />
          {crumb.isLast ? (
            <span aria-current="page" className="font-semibold text-[#f4f8f8]">
              {crumb.label}
            </span>
          ) : (
            <Link href={crumb.href} className="transition-colors hover:text-[#ff8882]">
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

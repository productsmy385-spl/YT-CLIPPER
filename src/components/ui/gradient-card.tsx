'use client';

import { cn } from '@/lib/utils';
import React, { useEffect, useRef, useState } from 'react';

export type GradientVariant =
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'purple'
  | 'pink'
  | 'ocean'
  | 'sunset';

interface GradientCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  variant?: GradientVariant;
  className?: string;
}

export function GradientCard({
  title,
  value,
  change,
  changeLabel = 'vs last run',
  icon,
  variant = 'ocean',
  className,
}: GradientCardProps) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        `gradient-${variant} relative overflow-hidden rounded-xl p-5 text-white shadow-card transition-all hover:scale-[1.01] hover:shadow-dropdown`,
        visible ? 'animate-fade-in-up' : 'opacity-0',
        className
      )}
    >
      <div className="absolute -right-3 -top-3 h-20 w-20 rounded-full bg-white/10 pointer-events-none" />
      <div className="absolute -bottom-4 -right-4 h-24 w-24 rounded-full bg-white/5 pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold tracking-wide text-white/85 uppercase">{title}</p>
          {icon && (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 backdrop-blur-sm shadow-sm">
              {icon}
            </div>
          )}
        </div>
        <p className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight">{value}</p>
        {change !== undefined && (
          <p className="mt-1.5 text-2xs text-white/80 font-medium flex items-center gap-1">
            <span className="font-bold text-white bg-white/20 px-1.5 py-0.5 rounded">
              {change >= 0 ? '↑' : '↓'} {Math.abs(change)}%
            </span>{' '}
            {changeLabel}
          </p>
        )}
      </div>
    </div>
  );
}

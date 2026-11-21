'use client';

import { cn } from '@/lib/utils';
import React, { useEffect, useRef, useState } from 'react';

export type ProgressVariant = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'gradient';

interface AnimatedProgressProps {
  value: number;
  max?: number;
  label?: string;
  showValue?: boolean;
  variant?: ProgressVariant;
  size?: 'sm' | 'md' | 'lg';
  striped?: boolean;
  className?: string;
}

const variantStyles: Record<ProgressVariant, string> = {
  primary: 'bg-[#ff8882]',
  success: 'bg-[#9dbeb8]',
  warning: 'bg-[#ffc2b4]',
  danger: 'bg-rose-500',
  info: 'bg-[#9dbeb8]',
  gradient: 'bg-gradient-to-r from-[#ff8882] via-[#ffc2b4] to-[#9dbeb8]',
};

const sizeStyles = { sm: 'h-1', md: 'h-2', lg: 'h-3' };

export function AnimatedProgress({
  value,
  max = 100,
  label,
  showValue = true,
  variant = 'primary',
  size = 'md',
  striped = false,
  className,
}: AnimatedProgressProps) {
  const [width, setWidth] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const percentage = Math.min(Math.round((value / max) * 100), 100);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          timer = setTimeout(() => setWidth(percentage), 80);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [percentage]);

  return (
    <div ref={ref} className={cn('space-y-1.5', className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between">
          {label && <span className="text-2xs font-semibold text-[#f4f8f8]">{label}</span>}
          {showValue && (
            <span className="text-2xs font-bold text-[#9dbeb8]">{percentage}%</span>
          )}
        </div>
      )}
      <div className={cn('w-full overflow-hidden rounded-full bg-[#163641]', sizeStyles[size])}>
        <div
          className={cn(
            'h-full rounded-full transition-all duration-1000 ease-out',
            variantStyles[variant],
            striped &&
              'bg-[length:0.75rem_0.75rem] bg-[linear-gradient(45deg,rgba(255,255,255,.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,.2)_50%,rgba(255,255,255,.2)_75%,transparent_75%,transparent)]'
          )}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

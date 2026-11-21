'use client';

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { User } from 'lucide-react';

interface AvatarProps {
  src?: string | null;
  name?: string;
  initials?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  alt?: string;
}

const sizeClasses = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-base font-bold',
  xl: 'w-20 h-20 text-xl font-extrabold',
};

export function Avatar({
  src,
  name = 'User',
  initials,
  size = 'sm',
  className,
  alt,
}: AvatarProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Compute initials fallback
  const displayInitials =
    initials ||
    (name
      ? name
          .split(' ')
          .filter(Boolean)
          .map((n) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2)
      : 'VC');

  useEffect(() => {
    // Reset state on src change
    setImageLoaded(false);
    setImageError(false);
  }, [src]);

  const hasValidImage = src && !imageError;

  return (
    <div
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-full overflow-hidden select-none border border-border transition-transform',
        sizeClasses[size],
        className
      )}
    >
      {hasValidImage ? (
        <>
          <img
            src={src}
            alt={alt || name}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
            className={cn(
              'h-full w-full object-cover transition-opacity duration-200',
              imageLoaded ? 'opacity-100' : 'opacity-0'
            )}
          />
          {!imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground animate-pulse text-xs font-bold">
              {displayInitials}
            </div>
          )}
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#ff8882] via-[#ffc2b4] to-[#9dbeb8] text-[#194350] font-extrabold shadow-inner">
          {displayInitials || <User className="w-1/2 h-1/2" />}
        </div>
      )}
    </div>
  );
}

import { cn } from '@/lib/utils';
import React from 'react';

export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'success'
  | 'destructive'
  | 'warning'
  | 'info'
  | 'outline'
  | 'coral'
  | 'peach'
  | 'seafoam'
  | 'spruce'
  | 'cyan'
  | 'pink';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-[#ff8882]/15 text-[#ff8882] border border-[#ff8882]/30',
  secondary: 'bg-[#194350] text-[#9dbeb8] border border-[#1d4551]',
  success: 'bg-[#9dbeb8]/15 text-[#9dbeb8] border border-[#9dbeb8]/30',
  destructive: 'bg-rose-500/15 text-rose-400 border border-rose-500/30',
  warning: 'bg-[#ffc2b4]/15 text-[#ffc2b4] border border-[#ffc2b4]/30',
  info: 'bg-[#9dbeb8]/15 text-[#9dbeb8] border border-[#9dbeb8]/30',
  outline: 'border border-[#1d4551] text-[#f4f8f8]',
  coral: 'bg-[#ff8882]/15 text-[#ff8882] border border-[#ff8882]/30',
  peach: 'bg-[#ffc2b4]/15 text-[#ffc2b4] border border-[#ffc2b4]/30',
  seafoam: 'bg-[#9dbeb8]/15 text-[#9dbeb8] border border-[#9dbeb8]/30',
  spruce: 'bg-[#194350] text-[#ffc2b4] border border-[#1d4551]',
  cyan: 'bg-[#9dbeb8]/15 text-[#9dbeb8] border border-[#9dbeb8]/30',
  pink: 'bg-[#ff8882]/15 text-[#ff8882] border border-[#ff8882]/30',
};

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-2xs font-semibold uppercase tracking-wider transition-colors',
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
}

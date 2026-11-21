import { cn } from '@/lib/utils';
import React from 'react';

export type ButtonVariant =
  | 'default'
  | 'destructive'
  | 'outline'
  | 'secondary'
  | 'ghost'
  | 'link'
  | 'success'
  | 'gradient';

export type ButtonSize = 'default' | 'sm' | 'lg' | 'xl' | 'icon' | 'icon-sm';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  default: 'bg-primary text-[#194350] font-bold hover:opacity-95 shadow-sm',
  destructive: 'bg-destructive text-white hover:bg-red-600 shadow-sm',
  outline: 'border border-border bg-background text-foreground hover:bg-muted transition-colors',
  secondary: 'bg-muted text-foreground hover:bg-muted/80 border border-border transition-colors',
  ghost: 'text-muted-foreground hover:text-foreground hover:bg-muted transition-colors',
  link: 'text-primary underline-offset-4 hover:underline p-0 h-auto',
  success: 'bg-emerald-500 text-white font-bold hover:bg-emerald-600 shadow-sm',
  gradient: 'bg-gradient-to-r from-[#ff8882] via-[#ffc2b4] to-[#9dbeb8] text-[#194350] font-extrabold shadow-sm hover:opacity-95 active:scale-[0.99]',
};

const sizeClasses: Record<ButtonSize, string> = {
  default: 'h-9 px-4 py-2 text-sm',
  sm: 'h-8 px-3 text-xs',
  lg: 'h-10 px-5 text-sm',
  xl: 'h-11 px-6 text-base',
  icon: 'h-9 w-9 p-0',
  'icon-sm': 'h-8 w-8 p-0',
};

export function Button({
  className,
  variant = 'default',
  size = 'default',
  isLoading = false,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff8882] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <svg
          className="h-4 w-4 animate-spin"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}

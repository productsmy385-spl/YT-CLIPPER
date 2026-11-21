import { cn } from '@/lib/utils';
import React from 'react';

export const fieldClass = cn(
  'w-full rounded-lg border border-border bg-input text-sm text-foreground shadow-sm transition-colors',
  'placeholder:text-muted-foreground/70 hover:border-primary/40',
  'focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20',
  'disabled:cursor-not-allowed disabled:opacity-50'
);

interface FieldProps {
  id?: string;
  label?: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}

export function Field({ id, label, error, hint, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={id} className="block text-xs font-semibold leading-none text-foreground">
          {label}
        </label>
      )}
      {children}
      {error && <p className="text-2xs text-rose-500 font-medium">{error}</p>}
      {hint && !error && <p className="text-2xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
}

export function Input({ className, label, error, hint, id, icon, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <Field id={inputId} label={label} error={error} hint={hint}>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          className={cn(
            fieldClass,
            'flex h-9 px-3 py-1',
            icon && 'pl-9',
            error && 'border-rose-500 focus-visible:ring-rose-500/30',
            className
          )}
          {...props}
        />
      </div>
    </Field>
  );
}

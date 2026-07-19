import { InputHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  // Small grey helper note under the field (e.g. "leave blank if…").
  hint?: string;
  leftIcon?: React.ReactNode;
  // Interactive slot on the right (e.g. a password-reveal eye toggle).
  // Unlike leftIcon this stays clickable, so callers can drop a button in.
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftIcon, rightIcon, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-sm font-medium text-ink">{label}</label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-faint">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            className={clsx(
              'w-full rounded-xl border bg-card px-4 py-2.5 text-sm text-ink placeholder-faint',
              'focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary focus:border-transparent',
              'transition duration-150',
              leftIcon && 'pl-10',
              rightIcon && 'pr-10',
              error ? 'border-red-400' : 'border-border',
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        {hint && !error && <p className="text-xs text-faint">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

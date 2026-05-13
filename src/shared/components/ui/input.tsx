import * as React from 'react'
import { cn } from '@/shared/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-[var(--radius)] border border-[var(--line)] bg-[rgba(255,255,255,.02)] px-3 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--ink-mute)] focus-visible:border-[var(--mint)] focus-visible:shadow-[0_0_0_4px_var(--mint-glow)] disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

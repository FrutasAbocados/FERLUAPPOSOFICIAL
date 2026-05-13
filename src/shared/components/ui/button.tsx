import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '@/shared/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius)] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mint)] disabled:pointer-events-none disabled:opacity-50 select-none',
  {
    variants: {
      variant: {
        primary:
          'border border-transparent bg-[var(--mint)] text-[#0a1310] shadow-[0_4px_18px_var(--mint-glow)] hover:bg-[var(--mint-2)]',
        secondary:
          'border border-[var(--line)] bg-[rgba(255,255,255,.025)] text-[var(--ink)] hover:border-[var(--line-2)] hover:bg-[rgba(255,255,255,.04)]',
        outline:
          'border border-[var(--line-2)] bg-[rgba(255,255,255,.015)] text-[var(--ink-dim)] hover:border-[var(--mint-glow)] hover:bg-[var(--mint-glow)] hover:text-[var(--mint)]',
        ghost:
          'text-[var(--ink-dim)] hover:bg-[rgba(255,255,255,.04)] hover:text-[var(--ink)]',
        danger:
          'border border-transparent bg-[var(--coral)] text-[#160b09] hover:opacity-90',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

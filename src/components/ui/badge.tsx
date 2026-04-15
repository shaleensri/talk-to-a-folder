import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default:
          'border-zinc-700 bg-zinc-800 text-zinc-300',
        secondary:
          'border-zinc-800 bg-zinc-900 text-zinc-400',
        outline:
          'border-zinc-700 bg-transparent text-zinc-400',
        accent:
          'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
        success:
          'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
        warning:
          'border-amber-500/30 bg-amber-500/10 text-amber-400',
        destructive:
          'border-red-500/30 bg-red-500/10 text-red-400',
        ghost:
          'border-transparent bg-transparent text-zinc-500',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }

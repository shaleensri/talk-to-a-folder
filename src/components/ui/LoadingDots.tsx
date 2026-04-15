'use client'

import { cn } from '@/lib/utils'

interface LoadingDotsProps {
  className?: string
  size?: 'sm' | 'md'
}

export function LoadingDots({ className, size = 'md' }: LoadingDotsProps) {
  const dotSize = size === 'sm' ? 'w-1 h-1' : 'w-1.5 h-1.5'

  return (
    <span className={cn('inline-flex items-center gap-1', className)} aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            'rounded-full bg-current opacity-60',
            dotSize,
            'animate-[dot-bounce_1.4s_ease-in-out_infinite]',
          )}
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </span>
  )
}

'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface AnimatedBorderProps {
  children: React.ReactNode
  active?: boolean
  className?: string
}

/**
 * Wraps a child element with an animated glowing border that activates
 * when the `active` prop is true (e.g., when the chat composer is focused).
 */
export function AnimatedBorder({ children, active, className }: AnimatedBorderProps) {
  return (
    <div className={cn('relative rounded-xl', className)}>
      {/* Base border */}
      <div
        className={cn(
          'absolute inset-0 rounded-xl border transition-colors duration-200',
          active ? 'border-indigo-500/40' : 'border-zinc-700',
        )}
      />
      {/* Glow layer */}
      <motion.div
        className="absolute inset-0 rounded-xl"
        animate={
          active
            ? {
                boxShadow: [
                  '0 0 0 0 rgba(99,102,241,0)',
                  '0 0 0 3px rgba(99,102,241,0.15)',
                  '0 0 0 3px rgba(99,102,241,0.1)',
                ],
              }
            : { boxShadow: '0 0 0 0 rgba(99,102,241,0)' }
        }
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
      {/* Content */}
      <div className="relative">{children}</div>
    </div>
  )
}

'use client'

import { useRef } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { cn } from '@/lib/utils'

interface TiltCardProps {
  children: React.ReactNode
  className?: string
  strength?: number       // max tilt degrees (default 8)
  scaleOnHover?: number   // inner scale on hover (default 1.02)
}

/**
 * Wraps children in a card that tilts in 3D toward the cursor,
 * with the inner content scaling slightly — same depth illusion as chester.how.
 */
export function TiltCard({
  children,
  className,
  strength = 8,
  scaleOnHover = 1.02,
}: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null)

  const rawX = useMotionValue(0)
  const rawY = useMotionValue(0)

  // Spring-smooth the raw mouse values for organic feel
  const springConfig = { stiffness: 280, damping: 28 }
  const x = useSpring(rawX, springConfig)
  const y = useSpring(rawY, springConfig)

  const rotateX = useTransform(y, [-0.5, 0.5], [strength, -strength])
  const rotateY = useTransform(x, [-0.5, 0.5], [-strength, strength])
  const scale = useSpring(1, springConfig)
  const innerX = useTransform(x, [-0.5, 0.5], [4, -4])
  const innerY = useTransform(y, [-0.5, 0.5], [4, -4])

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    rawX.set((e.clientX - rect.left) / rect.width - 0.5)
    rawY.set((e.clientY - rect.top) / rect.height - 0.5)
    scale.set(scaleOnHover)
  }

  function onMouseLeave() {
    rawX.set(0)
    rawY.set(0)
    scale.set(1)
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{
        rotateX,
        rotateY,
        scale,
        transformStyle: 'preserve-3d',
        transformPerspective: 800,
      }}
      className={cn('relative', className)}
    >
      {/* Inner layer — moves slightly opposite direction for parallax depth */}
      <motion.div
        style={{
          translateX: innerX,
          translateY: innerY,
          translateZ: 20,
        }}
        className="h-full w-full"
      >
        {children}
      </motion.div>
    </motion.div>
  )
}

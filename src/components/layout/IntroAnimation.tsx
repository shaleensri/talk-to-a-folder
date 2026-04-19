'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import { FolderOpen } from 'lucide-react'

interface IntroAnimationProps {
  onComplete: () => void
}

// Each word gets its own spring — "talk" bounces up from below,
// "folder" follows with a slight delay, then the dot pops in between them.
const springUp = {
  initial: { y: 60, opacity: 0 },
  animate: { y: 0, opacity: 1 },
}

export function IntroAnimation({ onComplete }: IntroAnimationProps) {
  const [show, setShow] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setShow(false), 2800)
    return () => clearTimeout(t)
  }, [onComplete])

  return (
    <AnimatePresence onExitComplete={onComplete}>
      {show && (
        <motion.div
          key="intro"
          className="fixed inset-0 z-[100] bg-zinc-950 flex items-center justify-center select-none"
          // Curtain lifts upward — slow start, accelerates away
          exit={{ y: '-100%' }}
          transition={{ duration: 0.85, ease: [0.55, 0, 1, 0.45] }}
        >
          {/* Ambient glow behind everything */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <div className="w-[600px] h-[600px] rounded-full bg-indigo-600/8 blur-[120px]" />
          </div>

          <div className="relative flex flex-col items-center gap-7">
            {/* Icon */}
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.7, type: 'spring', stiffness: 160, damping: 14 }}
              className="relative"
            >
              {/* Glow ring */}
              <div className="absolute inset-0 scale-[2] rounded-3xl bg-indigo-500/15 blur-2xl" />
              <div className="relative w-[72px] h-[72px] rounded-[18px] bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center shadow-[0_0_40px_rgba(99,102,241,0.15)]">
                <FolderOpen className="w-8 h-8 text-indigo-400" strokeWidth={1.5} />
              </div>
            </motion.div>

            {/* Brand name — "talk" and "folder" spring up from below, dot pops in */}
            <div className="flex items-baseline gap-0 overflow-hidden">
              <motion.span
                {...springUp}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.45, duration: 0.65, type: 'spring', stiffness: 200, damping: 22 }}
                className="text-[52px] font-bold leading-none tracking-tight text-zinc-100"
              >
                talk
              </motion.span>

              <motion.span
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.8, duration: 0.35, type: 'spring', stiffness: 300 }}
                className="text-[52px] font-bold leading-none text-indigo-400 mx-[3px]"
              >
                ·
              </motion.span>

              <motion.span
                {...springUp}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.55, duration: 0.65, type: 'spring', stiffness: 200, damping: 22 }}
                className="text-[52px] font-bold leading-none tracking-tight text-zinc-100"
              >
                folder
              </motion.span>
            </div>

            {/* Tagline */}
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.05, duration: 0.55, ease: 'easeOut' }}
              className="text-[13px] tracking-[0.2em] uppercase text-zinc-500 font-medium"
            >
              your documents, answered
            </motion.p>

            {/* Expanding line */}
            <motion.div
              className="h-px rounded-full bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 260, opacity: 1 }}
              transition={{ delay: 1.4, duration: 0.9, ease: 'easeOut' }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

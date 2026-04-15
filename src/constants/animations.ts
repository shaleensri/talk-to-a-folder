import type { Variants, Transition } from 'framer-motion'

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

export const spring: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 30,
}

export const springGentle: Transition = {
  type: 'spring',
  stiffness: 200,
  damping: 25,
}

export const springSnappy: Transition = {
  type: 'spring',
  stiffness: 500,
  damping: 35,
}

export const ease: Transition = {
  type: 'tween',
  duration: 0.2,
  ease: 'easeOut',
}

export const easeFast: Transition = {
  type: 'tween',
  duration: 0.15,
  ease: 'easeOut',
}

// ---------------------------------------------------------------------------
// Reusable variants
// ---------------------------------------------------------------------------

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: ease },
  exit: { opacity: 0, transition: easeFast },
}

export const slideUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: ease },
  exit: { opacity: 0, y: -4, transition: easeFast },
}

export const slideDown: Variants = {
  hidden: { opacity: 0, y: -8 },
  visible: { opacity: 1, y: 0, transition: ease },
  exit: { opacity: 0, y: -8, transition: easeFast },
}

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: springSnappy },
  exit: { opacity: 0, scale: 0.97, transition: easeFast },
}

export const scaleInSmall: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: spring },
  exit: { opacity: 0, scale: 0.95, transition: easeFast },
}

// For staggered lists
export const listContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.05,
    },
  },
}

export const listItem: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: ease },
}

// For the assistant message card — slightly more dramatic entrance
export const messageCard: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { ...springGentle, duration: 0.3 },
  },
}

// Citation badge pop
export const citationPop: Variants = {
  rest: { scale: 1 },
  hover: { scale: 1.12, transition: springSnappy },
  tap: { scale: 0.92, transition: springSnappy },
}

// Source card highlight pulse
export const sourceHighlight: Variants = {
  normal: { boxShadow: '0 0 0 0 rgba(99,102,241,0)' },
  highlighted: {
    boxShadow: '0 0 0 2px rgba(99,102,241,0.4)',
    transition: spring,
  },
}

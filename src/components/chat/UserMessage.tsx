'use client'

import { motion } from 'framer-motion'
import { slideUp } from '@/constants/animations'
import type { ChatMessage } from '@/types'

interface UserMessageProps {
  message: ChatMessage
}

export function UserMessage({ message }: UserMessageProps) {
  return (
    <motion.div
      variants={slideUp}
      initial="hidden"
      animate="visible"
      className="flex justify-end"
    >
      <div className="max-w-[75%] rounded-2xl rounded-tr-md bg-gradient-to-br from-indigo-500 to-indigo-700 px-4 py-2.5 text-sm text-white shadow-[0_4px_20px_rgba(99,102,241,0.3),0_1px_0_rgba(255,255,255,0.15)_inset] leading-relaxed">
        {message.content}
      </div>
    </motion.div>
  )
}

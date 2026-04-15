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
      <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-2.5 text-sm text-white shadow-sm">
        {message.content}
      </div>
    </motion.div>
  )
}

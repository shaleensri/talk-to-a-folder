'use client'

import { Sparkles, FolderOpen, MessageSquarePlus } from 'lucide-react'
import { motion } from 'framer-motion'
import { useChatStore } from '@/store/chat-store'
import { listContainer, listItem, scaleIn } from '@/constants/animations'
import { MOCK_SUGGESTED_QUESTIONS } from '@/lib/mock-data'
import type { IndexedFolder } from '@/types'

interface EmptyChatProps {
  activeFolder: IndexedFolder | null
  onQuestionSelect: (question: string) => void
}

export function EmptyChat({ activeFolder, onQuestionSelect }: EmptyChatProps) {
  if (!activeFolder) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16">
        <motion.div
          variants={scaleIn}
          initial="hidden"
          animate="visible"
          className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center"
        >
          <FolderOpen className="w-6 h-6 text-zinc-600" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-center space-y-1.5"
        >
          <h2 className="text-base font-semibold text-zinc-300">
            No folder selected
          </h2>
          <p className="text-sm text-zinc-600 max-w-xs">
            Add a Google Drive folder from the sidebar to start asking questions
            about your documents.
          </p>
        </motion.div>
      </div>
    )
  }

  const suggestedQuestions =
    MOCK_SUGGESTED_QUESTIONS[activeFolder.id] ??
    MOCK_SUGGESTED_QUESTIONS['mock-folder-q4-strategy'] ??
    []

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16">
      {/* Icon + heading */}
      <motion.div
        variants={scaleIn}
        initial="hidden"
        animate="visible"
        className="flex flex-col items-center gap-3"
      >
        <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-indigo-400" />
        </div>
        <div className="text-center">
          <h2 className="text-base font-semibold text-zinc-200">
            Ask about{' '}
            <span className="text-indigo-400">{activeFolder.name}</span>
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            {activeFolder.fileCount} file{activeFolder.fileCount !== 1 ? 's' : ''} indexed
            {' · '}
            {activeFolder.chunkCount} chunks
          </p>
        </div>
      </motion.div>

      {/* Suggested questions */}
      {suggestedQuestions.length > 0 && (
        <motion.div
          variants={listContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 gap-2 w-full max-w-lg"
        >
          {suggestedQuestions.map((q) => (
            <motion.button
              key={q.id}
              variants={listItem}
              onClick={() => onQuestionSelect(q.text)}
              className="group flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-left text-sm text-zinc-400 transition-all duration-150 hover:border-zinc-700 hover:bg-zinc-800/80 hover:text-zinc-200 hover:shadow-card active:scale-[0.99]"
            >
              <MessageSquarePlus className="w-4 h-4 mt-0.5 flex-shrink-0 text-zinc-600 group-hover:text-indigo-400 transition-colors" />
              {q.text}
            </motion.button>
          ))}
        </motion.div>
      )}
    </div>
  )
}

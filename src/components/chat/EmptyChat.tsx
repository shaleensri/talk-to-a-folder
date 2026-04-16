'use client'

import { Sparkles, FolderOpen, FileSearch } from 'lucide-react'
import { TiltCard } from '@/components/ui/TiltCard'
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
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-16 relative">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-80 h-80 rounded-full bg-indigo-600/4 blur-[80px]" />
        </div>
        <motion.div
          variants={scaleIn}
          initial="hidden"
          animate="visible"
          className="relative w-14 h-14 rounded-2xl bg-zinc-900/80 border border-white/[0.07] flex items-center justify-center"
        >
          <FolderOpen className="w-6 h-6 text-zinc-600" />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-center space-y-1.5"
        >
          <h2 className="text-base font-semibold text-zinc-300">No folder selected</h2>
          <p className="text-sm text-zinc-600 max-w-xs leading-relaxed">
            Add a Google Drive folder from the sidebar to start asking questions about your documents.
          </p>
        </motion.div>
      </div>
    )
  }

  const IS_MOCK = process.env.NEXT_PUBLIC_MOCK_MODE === 'true'
  const mockQuestions = IS_MOCK
    ? (MOCK_SUGGESTED_QUESTIONS[activeFolder.id] ?? MOCK_SUGGESTED_QUESTIONS['mock-folder-q4-strategy'] ?? [])
    : []

  const genericQuestions = activeFolder.fileCount > 0 && !IS_MOCK ? [
    { id: 'q1', text: `Give me an overview of everything in "${activeFolder.name}"` },
    { id: 'q2', text: 'What are the key themes and topics across these documents?' },
    { id: 'q3', text: 'What are the most important insights or takeaways?' },
  ] : []

  const suggestedQuestions = mockQuestions.length > 0 ? mockQuestions : genericQuestions

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-7 px-6 py-16 relative">
      {/* Ambient glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-96 h-96 rounded-full bg-indigo-600/5 blur-[100px]" />
      </div>

      {/* Icon + heading */}
      <motion.div
        variants={scaleIn}
        initial="hidden"
        animate="visible"
        className="relative flex flex-col items-center gap-4"
      >
        <div className="relative">
          <div className="absolute inset-0 scale-150 rounded-2xl bg-indigo-500/10 blur-xl" />
          <div className="relative w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shadow-[0_0_30px_rgba(99,102,241,0.1)]">
            <Sparkles className="w-6 h-6 text-indigo-400" strokeWidth={1.5} />
          </div>
        </div>
        <div className="text-center">
          <h2 className="text-base font-semibold text-zinc-200">
            Ask about <span className="text-gradient-indigo">{activeFolder.name}</span>
          </h2>
          <p className="text-xs text-zinc-600 mt-1 tracking-wide">
            {activeFolder.fileCount} file{activeFolder.fileCount !== 1 ? 's' : ''} · {activeFolder.chunkCount} chunks indexed
          </p>
        </div>
      </motion.div>

      {/* Suggested questions */}
      {suggestedQuestions.length > 0 && (
        <motion.div
          variants={listContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 gap-2 w-full max-w-md"
        >
          {suggestedQuestions.map((q) => (
            <motion.div key={q.id} variants={listItem}>
              <TiltCard strength={5} scaleOnHover={1.01} className="rounded-xl w-full">
                <button
                  onClick={() => onQuestionSelect(q.text)}
                  className="group w-full flex items-start gap-3 rounded-xl border border-white/[0.06] bg-zinc-900/50 px-4 py-3.5 text-left text-sm text-zinc-500 transition-colors duration-150 hover:border-indigo-500/20 hover:bg-zinc-900/80 hover:text-zinc-200 shadow-[0_2px_12px_rgba(0,0,0,0.3)]"
                >
                  <FileSearch className="w-4 h-4 mt-0.5 flex-shrink-0 text-zinc-700 group-hover:text-indigo-400 transition-colors" />
                  {q.text}
                </button>
              </TiltCard>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  )
}

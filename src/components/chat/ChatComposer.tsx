'use client'

import { useState, useRef, useCallback, KeyboardEvent } from 'react'
import { ArrowUp, Square, X, Quote } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { AnimatedBorder } from '@/components/ui/AnimatedBorder'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { QuotedContext } from '@/types'

interface ChatComposerProps {
  onSend: (message: string, sourceFileId?: string) => void
  onStop?: () => void
  isLoading: boolean
  disabled?: boolean
  placeholder?: string
  quotedText?: QuotedContext | null
  onClearQuote?: () => void
}

export function ChatComposer({
  onSend,
  onStop,
  isLoading,
  disabled,
  placeholder = 'Ask a question about your folder…',
  quotedText,
  onClearQuote,
}: ChatComposerProps) {
  const [input, setInput] = useState('')
  const [focused, setFocused] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    // Prepend quoted text as a block-quote so the model sees the selection context.
    // Pass sourceFileId separately so the server can pin retrieval to that file.
    const finalMessage = quotedText
      ? `> ${quotedText.text}\n\n${trimmed}`
      : trimmed

    onSend(finalMessage, quotedText?.fileId)
    setInput('')
    onClearQuote?.()

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [input, isLoading, onSend, quotedText, onClearQuote])

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    // Auto-grow
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`
    }
  }

  const canSend = input.trim().length > 0 && !disabled

  return (
    <div className="px-4 pb-5 pt-2">
      <div className="max-w-3xl mx-auto">
        {/* Quoted text block */}
        <AnimatePresence>
          {quotedText && (
            <motion.div
              key="quote"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden mb-2"
            >
              <div className="flex items-start gap-2 rounded-xl bg-zinc-800/60 border border-zinc-700/50 px-3 py-2">
                <Quote className="w-3 h-3 text-zinc-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-zinc-400 leading-relaxed flex-1 line-clamp-3">
                  {quotedText?.text}
                </p>
                <button
                  onClick={onClearQuote}
                  className="text-zinc-600 hover:text-zinc-300 transition-colors flex-shrink-0 mt-0.5"
                  title="Remove quoted text"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatedBorder active={focused && !disabled}>
          <div
            className={cn(
              'flex items-end gap-2 rounded-2xl px-3 py-2.5',
              'bg-zinc-900/90 backdrop-blur-xl',
              'shadow-[0_8px_32px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.06)]',
              disabled && 'opacity-50',
            )}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={placeholder}
              disabled={disabled || isLoading}
              rows={1}
              className={cn(
                'flex-1 resize-none bg-transparent text-sm text-zinc-100',
                'placeholder:text-zinc-600 outline-none',
                'min-h-[24px] max-h-[200px] leading-6',
                'disabled:cursor-not-allowed',
              )}
              style={{ height: 'auto' }}
            />

            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div
                  key="stop"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                >
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={onStop}
                    className="text-zinc-400 hover:text-zinc-200 flex-shrink-0"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="send"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                >
                  <Button
                    size="icon-sm"
                    onClick={handleSend}
                    disabled={!canSend}
                    className={cn(
                      'flex-shrink-0 rounded-lg transition-all',
                      canSend
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-glow-sm'
                        : 'bg-zinc-800 text-zinc-600 cursor-not-allowed',
                    )}
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </AnimatedBorder>

        <p className="text-center text-[11px] text-zinc-700 mt-2 tracking-wide">
          Shift+Enter for new line · grounded in your documents
        </p>
      </div>
    </div>
  )
}

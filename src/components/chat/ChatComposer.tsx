'use client'

import { useState, useRef, useCallback, KeyboardEvent } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { AnimatedBorder } from '@/components/ui/AnimatedBorder'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ChatComposerProps {
  onSend: (message: string) => void
  onStop?: () => void
  isLoading: boolean
  disabled?: boolean
  placeholder?: string
}

export function ChatComposer({
  onSend,
  onStop,
  isLoading,
  disabled,
  placeholder = 'Ask a question about your folder…',
}: ChatComposerProps) {
  const [input, setInput] = useState('')
  const [focused, setFocused] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return
    onSend(trimmed)
    setInput('')
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [input, isLoading, onSend])

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
    <div className="border-t border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md px-4 py-3">
      <div className="max-w-3xl mx-auto">
        <AnimatedBorder active={focused && !disabled}>
          <div
            className={cn(
              'flex items-end gap-2 rounded-xl bg-zinc-900 px-3 py-2.5',
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

        <p className="text-center text-[11px] text-zinc-700 mt-2">
          Shift+Enter for new line · answers grounded in folder contents
        </p>
      </div>
    </div>
  )
}

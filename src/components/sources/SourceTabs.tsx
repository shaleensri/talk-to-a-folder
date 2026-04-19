'use client'

import { Layers, FolderTree as FolderTreeIcon, Bug } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SourceCard } from './SourceCard'
import { FolderTree } from './FolderTree'
import { DebugPanel } from './DebugPanel'
import { useUIStore } from '@/store/ui-store'
import { useChatStore } from '@/store/chat-store'
import type { FolderWithFiles } from '@/hooks/useTabFolders'

interface SourceTabsProps {
  folderFiles: FolderWithFiles[]
}

export function SourceTabs({ folderFiles }: SourceTabsProps) {
  const { rightPanelTab, setRightPanelTab } = useUIStore()
  const { tabs, activeTabId } = useChatStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const messages = activeTab?.messages ?? []

  // Get the last assistant message's data
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
  const citations = lastAssistant?.citations ?? []
  const debugInfo = lastAssistant?.debugInfo ?? null

  return (
    <Tabs
      value={rightPanelTab}
      onValueChange={(v) => setRightPanelTab(v as typeof rightPanelTab)}
      className="flex flex-col h-full"
    >
      <div className="flex-shrink-0 px-3 pt-3 pb-0">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="sources" className="gap-1.5">
            <Layers className="w-3 h-3" />
            Sources
            {citations.length > 0 && (
              <span className="ml-0.5 rounded bg-indigo-500/20 px-1 text-[10px] text-indigo-400">
                {citations.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="folder-view" className="gap-1.5">
            <FolderTreeIcon className="w-3 h-3" />
            Files
          </TabsTrigger>
          <TabsTrigger value="debug" className="gap-1.5">
            <Bug className="w-3 h-3" />
            Debug
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="sources" className="flex-1 mt-0 min-h-0">
        <ScrollArea className="h-full">
          <div className="p-3 space-y-2">
            {citations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-28 text-center">
                <Layers className="w-5 h-5 text-zinc-700 mb-2" />
                <p className="text-xs text-zinc-600">
                  Sources appear here after you ask a question
                </p>
              </div>
            ) : (
              citations.map((citation) => (
                <SourceCard key={citation.id} citation={citation} />
              ))
            )}
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="folder-view" className="flex-1 mt-0 min-h-0">
        <ScrollArea className="h-full">
          <FolderTree folderFiles={folderFiles} />
        </ScrollArea>
      </TabsContent>

      <TabsContent value="debug" className="flex-1 mt-0 min-h-0">
        <ScrollArea className="h-full">
          <DebugPanel debug={debugInfo} />
        </ScrollArea>
      </TabsContent>
    </Tabs>
  )
}

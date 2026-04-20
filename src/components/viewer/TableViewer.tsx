'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface TableViewerProps {
  rows: string[][]
  sheets?: string[]
  activeSheet?: string
}

export function TableViewer({ rows, sheets, activeSheet }: TableViewerProps) {
  const [searchQuery, setSearchQuery] = useState('')

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-zinc-600">
        No data found in this file
      </div>
    )
  }

  const headers = rows[0]
  const dataRows = rows.slice(1)

  const filtered = searchQuery.trim()
    ? dataRows.filter((row) =>
        row.some((cell) => cell.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : dataRows

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-white/[0.06] flex-shrink-0">
        {/* Sheet tabs — shown for Excel with multiple sheets */}
        {sheets && sheets.length > 1 && (
          <div className="flex items-center gap-1">
            {sheets.map((sheet) => (
              <span
                key={sheet}
                className={cn(
                  'text-[11px] px-2 py-0.5 rounded border transition-colors',
                  sheet === activeSheet
                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                    : 'border-zinc-800 text-zinc-500',
                )}
              >
                {sheet}
              </span>
            ))}
          </div>
        )}

        <div className="flex-1" />

        {/* Row count */}
        <span className="text-[11px] text-zinc-600 tabular-nums">
          {filtered.length} {filtered.length === 1 ? 'row' : 'rows'}
          {searchQuery && ` of ${dataRows.length}`}
        </span>

        {/* Search */}
        <input
          type="text"
          placeholder="Filter rows…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-6 w-36 rounded border border-zinc-800 bg-zinc-900 px-2 text-xs text-zinc-300 placeholder:text-zinc-600 focus:border-indigo-500/50 focus:outline-none transition-colors"
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-zinc-900">
            <tr>
              {/* Row number gutter */}
              <th className="w-8 border-b border-r border-zinc-800 px-2 py-2 text-right text-[10px] text-zinc-700 font-normal select-none" />
              {headers.map((header, i) => (
                <th
                  key={i}
                  className="border-b border-r border-zinc-800 px-3 py-2 text-left font-semibold text-zinc-300 whitespace-nowrap bg-zinc-900/90"
                >
                  {header || <span className="text-zinc-700">Column {i + 1}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={headers.length + 1}
                  className="px-3 py-8 text-center text-zinc-600"
                >
                  No rows match "{searchQuery}"
                </td>
              </tr>
            ) : (
              filtered.map((row, rowIdx) => {
                // Find original row index for the row number gutter
                const originalIdx = searchQuery
                  ? dataRows.indexOf(row)
                  : rowIdx

                return (
                  <tr
                    key={rowIdx}
                    className="group hover:bg-zinc-800/40 transition-colors"
                  >
                    {/* Row number */}
                    <td className="border-b border-r border-zinc-800/60 px-2 py-1.5 text-right text-[10px] text-zinc-700 select-none group-hover:text-zinc-500">
                      {originalIdx + 2}
                    </td>
                    {headers.map((_, colIdx) => (
                      <td
                        key={colIdx}
                        className={cn(
                          'border-b border-r border-zinc-800/40 px-3 py-1.5 text-zinc-300',
                          'max-w-[280px] truncate',
                        )}
                        title={row[colIdx] ?? ''}
                      >
                        {row[colIdx] ?? ''}
                      </td>
                    ))}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

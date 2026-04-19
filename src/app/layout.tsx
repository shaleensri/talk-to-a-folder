import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Providers } from './providers'
import { Toaster } from 'sonner'
import './globals.css'

export const metadata: Metadata = {
  title: 'Talk to a Folder — AI-powered document Q&A',
  description:
    'Connect a Google Drive folder and ask questions about your documents. Get grounded, cited answers powered by GPT-4o.',
  icons: {
    icon: '/favicon.ico',
  },
}

export const viewport: Viewport = {
  themeColor: '#0A0A0C',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <Providers>{children}</Providers>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#18181b',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#f4f4f5',
            },
          }}
        />
      </body>
    </html>
  )
}

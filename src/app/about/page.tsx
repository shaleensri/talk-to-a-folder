import Link from 'next/link'
import {
  FolderOpen,
  MessageSquare,
  FileText,
  MousePointer2,
  Quote,
  Layers,
  Search,
  History,
  FileSpreadsheet,
  ScanText,
  Sparkles,
  BookOpen,
} from 'lucide-react'

const features = [
  {
    icon: FolderOpen,
    title: 'Google Drive integration',
    description:
      'Browse and index any folder from your Google Drive with one click. Supports nested subfolders up to 5 levels deep.',
  },
  {
    icon: Search,
    title: 'Semantic search (RAG)',
    description:
      'Your documents are chunked and embedded. Answers are grounded in the actual content — not hallucinated from memory.',
  },
  {
    icon: MessageSquare,
    title: 'Chat tabs',
    description:
      'Run multiple independent chat sessions at once — one per project, folder, or question thread — without losing context.',
  },
  {
    icon: Layers,
    title: 'Multi-folder chat',
    description:
      'Combine folders into a single chat session. Compare docs across projects or search a whole knowledge base at once.',
  },
  {
    icon: FileText,
    title: 'Inline document viewer',
    description:
      'Preview PDFs, Google Docs, DOCX, CSV, Markdown, and Excel files directly in the app. No need to open Drive.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Excel viewer with sheet tabs',
    description:
      'XLSX files render as interactive tables with per-sheet tabs. Search and filter rows without leaving the app.',
  },
  {
    icon: MousePointer2,
    title: 'Text selection → Ask chat',
    description:
      'Highlight any passage in a document and send it straight to the chat. Works in PDF, DOCX, TXT, CSV, and Markdown viewers.',
  },
  {
    icon: Quote,
    title: 'Quote-pinned retrieval',
    description:
      'When you quote a passage, the retrieval is anchored to that exact file and text — the same way Cursor and Copilot work.',
  },
  {
    icon: ScanText,
    title: 'Citation-backed answers',
    description:
      'Every answer includes source citations so you can verify which file and passage the model drew from.',
  },
  {
    icon: History,
    title: 'Conversation history',
    description:
      'Chat sessions are persisted across page reloads. Pick up any conversation exactly where you left off.',
  },
  {
    icon: Sparkles,
    title: 'Context-aware follow-ups',
    description:
      'Vague follow-ups like "tell me more" or "what about that file?" are automatically rewritten into self-contained queries.',
  },
  {
    icon: BookOpen,
    title: 'Broad + deep retrieval',
    description:
      'Asks about "anything in the folder" trigger cross-file search. Questions about a specific file trigger deep single-file search.',
  },
]

const steps = [
  {
    number: '01',
    title: 'Connect Google Drive',
    body: 'Sign in with Google, then click Add folder. Browse your Drive folders and select one to index. We fetch the folder name and kick off indexing immediately.',
  },
  {
    number: '02',
    title: 'Wait for indexing',
    body: 'Files are downloaded, parsed, and split into overlapping chunks. Each chunk is embedded with text-embedding-3-small and stored for retrieval. Large folders may take a minute.',
  },
  {
    number: '03',
    title: 'Ask questions',
    body: 'Open a chat tab, choose your folder(s), and start asking. You can also open the document viewer and highlight text to ask about a specific passage.',
  },
  {
    number: '04',
    title: 'Read cited answers',
    body: 'Answers arrive as a stream and include citations. Click a citation to jump to the source file in the viewer.',
  },
]

const supported = [
  'Google Docs',
  'Google Sheets',
  'Google Slides',
  'PDF',
  'DOCX / DOC',
  'XLSX / XLS',
  'PPTX',
  'CSV',
  'Plain text',
  'Markdown',
]

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      {/* Top nav */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-6 py-3 bg-zinc-950/80 backdrop-blur-xl border-b border-white/[0.05]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-[0_0_14px_rgba(99,102,241,0.45)]">
            <FolderOpen className="w-3.5 h-3.5 text-white" strokeWidth={2} />
          </div>
          <span className="text-sm font-semibold tracking-tight">
            <span className="text-zinc-100">talk</span>
            <span className="text-indigo-400">·</span>
            <span className="text-zinc-100">folder</span>
          </span>
        </div>
        <Link
          href="/app"
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
        >
          Open app
        </Link>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-16 space-y-24">

        {/* Hero */}
        <section className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/20 bg-indigo-500/5 text-xs text-indigo-300 mb-2">
            <Sparkles className="w-3 h-3" />
            AI-powered document Q&amp;A
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-50">
            Ask questions about your<br />Google Drive documents
          </h1>
          <p className="text-zinc-400 text-lg max-w-xl mx-auto leading-relaxed">
            talk·folder connects to your Google Drive, indexes your files, and lets
            you chat with them. Answers are grounded in your actual documents —
            with citations to the source passage.
          </p>
          <Link
            href="/app"
            className="inline-flex items-center gap-2 mt-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white transition-colors shadow-[0_4px_20px_rgba(99,102,241,0.3)]"
          >
            Open the app
          </Link>
        </section>

        {/* Features grid */}
        <section className="space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-zinc-100">Features</h2>
            <p className="text-zinc-500 text-sm mt-1">Everything that's in the app today</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {features.map((f) => {
              const Icon = f.icon
              return (
                <div
                  key={f.title}
                  className="rounded-xl border border-white/[0.06] bg-zinc-900/50 p-4 space-y-2 hover:border-indigo-500/20 hover:bg-zinc-900 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-3.5 h-3.5 text-indigo-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-zinc-100">{f.title}</h3>
                  </div>
                  <p className="text-xs text-zinc-500 leading-relaxed">{f.description}</p>
                </div>
              )
            })}
          </div>
        </section>

        {/* How it works */}
        <section className="space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-zinc-100">How it works</h2>
            <p className="text-zinc-500 text-sm mt-1">From Drive folder to cited answer in four steps</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {steps.map((s) => (
              <div
                key={s.number}
                className="rounded-xl border border-white/[0.06] bg-zinc-900/50 p-5 space-y-2"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-indigo-500/30 tabular-nums leading-none">{s.number}</span>
                  <h3 className="text-sm font-semibold text-zinc-100">{s.title}</h3>
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Supported file types */}
        <section className="space-y-4">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-zinc-100">Supported file types</h2>
            <p className="text-zinc-500 text-sm mt-1">Files outside this list are skipped during indexing</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {supported.map((t) => (
              <span
                key={t}
                className="px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900 text-xs text-zinc-400"
              >
                {t}
              </span>
            ))}
          </div>
        </section>

        {/* Tech note */}
        <section className="rounded-xl border border-white/[0.06] bg-zinc-900/30 p-6 space-y-2 text-center">
          <h3 className="text-sm font-semibold text-zinc-200">Under the hood</h3>
          <p className="text-xs text-zinc-500 leading-relaxed max-w-lg mx-auto">
            Documents are chunked with overlap and embedded using OpenAI&apos;s{' '}
            <span className="text-zinc-400">text-embedding-3-small</span>. Retrieval
            uses cosine similarity via pgvector. Answers are generated by{' '}
            <span className="text-zinc-400">GPT-4o</span> with a grounded system
            prompt that instructs the model to cite sources and stay within the
            retrieved context. Query rewriting resolves vague follow-ups before
            retrieval.
          </p>
        </section>

      </main>

      <footer className="border-t border-white/[0.05] py-6 text-center text-xs text-zinc-700">
        talk·folder — built with Next.js, OpenAI, and pgvector
      </footer>
    </div>
  )
}

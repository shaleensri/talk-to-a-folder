/**
 * Rich mock data for demo mode (NEXT_PUBLIC_MOCK_MODE=true).
 * This makes the full UX demoable without any API keys.
 */

import type {
  IndexedFolder,
  DriveFile,
  ChatMessage,
  Citation,
  AnswerMetadata,
  RetrievalDebugInfo,
  SuggestedQuestion,
  IngestionProgress,
} from '@/types'

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export const MOCK_FOLDERS: IndexedFolder[] = [
  {
    id: 'mock-folder-q4-strategy',
    name: 'Q4 2024 Product Strategy',
    driveUrl: 'https://drive.google.com/drive/folders/mock_q4_strategy',
    folderId: 'mock_q4_strategy',
    status: 'indexed',
    fileCount: 5,
    chunkCount: 47,
    lastIndexed: new Date('2025-04-10T14:30:00'),
    userId: 'mock-user',
    createdAt: new Date('2025-04-10T14:00:00'),
    updatedAt: new Date('2025-04-10T14:30:00'),
  },
  {
    id: 'mock-folder-eng-docs',
    name: 'Engineering Design Docs',
    driveUrl: 'https://drive.google.com/drive/folders/mock_eng_docs',
    folderId: 'mock_eng_docs',
    status: 'indexed',
    fileCount: 8,
    chunkCount: 93,
    lastIndexed: new Date('2025-04-08T09:15:00'),
    userId: 'mock-user',
    createdAt: new Date('2025-04-08T09:00:00'),
    updatedAt: new Date('2025-04-08T09:15:00'),
  },
]

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export const MOCK_FILES: Record<string, DriveFile[]> = {
  'mock-folder-q4-strategy': [
    {
      id: 'file-roadmap',
      folderId: 'mock-folder-q4-strategy',
      driveFileId: 'gdoc_roadmap',
      name: 'Product Roadmap Q4 2024.gdoc',
      mimeType: 'application/vnd.google-apps.document',
      size: null,
      status: 'indexed',
      parsedAt: new Date('2025-04-10T14:10:00'),
    },
    {
      id: 'file-research',
      folderId: 'mock-folder-q4-strategy',
      driveFileId: 'pdf_research',
      name: 'User Research Summary.pdf',
      mimeType: 'application/pdf',
      size: 842240,
      status: 'indexed',
      parsedAt: new Date('2025-04-10T14:12:00'),
    },
    {
      id: 'file-competitor',
      folderId: 'mock-folder-q4-strategy',
      driveFileId: 'gdoc_competitor',
      name: 'Competitor Analysis.gdoc',
      mimeType: 'application/vnd.google-apps.document',
      size: null,
      status: 'indexed',
      parsedAt: new Date('2025-04-10T14:14:00'),
    },
    {
      id: 'file-metrics',
      folderId: 'mock-folder-q4-strategy',
      driveFileId: 'gsheet_metrics',
      name: 'Q4 Growth Metrics.gsheet',
      mimeType: 'application/vnd.google-apps.spreadsheet',
      size: null,
      status: 'indexed',
      parsedAt: new Date('2025-04-10T14:16:00'),
    },
    {
      id: 'file-notes',
      folderId: 'mock-folder-q4-strategy',
      driveFileId: 'gdoc_notes',
      name: 'Exec Team Notes.gdoc',
      mimeType: 'application/vnd.google-apps.document',
      size: null,
      status: 'indexed',
      parsedAt: new Date('2025-04-10T14:18:00'),
    },
  ],
}

// ---------------------------------------------------------------------------
// Suggested questions per folder
// ---------------------------------------------------------------------------

export const MOCK_SUGGESTED_QUESTIONS: Record<string, SuggestedQuestion[]> = {
  'mock-folder-q4-strategy': [
    { id: 'sq-1', text: 'What are the top user pain points from the research?' },
    { id: 'sq-2', text: 'What are our competitive differentiators vs. key rivals?' },
    { id: 'sq-3', text: 'What are the Q4 revenue and growth targets?' },
    { id: 'sq-4', text: 'What features are prioritized for Q4 shipping?' },
  ],
  'mock-folder-eng-docs': [
    { id: 'sq-5', text: 'What is the system architecture overview?' },
    { id: 'sq-6', text: 'What are the key API design decisions?' },
    { id: 'sq-7', text: 'What databases and caching layers are in use?' },
  ],
}

// ---------------------------------------------------------------------------
// Ingestion simulation steps
// ---------------------------------------------------------------------------

export const MOCK_INGESTION_STEPS: IngestionProgress[] = [
  {
    folderId: 'mock-folder-new',
    status: 'ingesting',
    progress: { total: 5, parsed: 0, indexed: 0, failed: 0, skipped: 0 },
    currentFile: 'Scanning folder...',
  },
  {
    folderId: 'mock-folder-new',
    status: 'ingesting',
    progress: { total: 5, parsed: 1, indexed: 0, failed: 0, skipped: 0 },
    currentFile: 'Product Roadmap Q4 2024.gdoc',
  },
  {
    folderId: 'mock-folder-new',
    status: 'ingesting',
    progress: { total: 5, parsed: 2, indexed: 1, failed: 0, skipped: 0 },
    currentFile: 'User Research Summary.pdf',
  },
  {
    folderId: 'mock-folder-new',
    status: 'ingesting',
    progress: { total: 5, parsed: 3, indexed: 2, failed: 0, skipped: 0 },
    currentFile: 'Competitor Analysis.gdoc',
  },
  {
    folderId: 'mock-folder-new',
    status: 'ingesting',
    progress: { total: 5, parsed: 4, indexed: 3, failed: 0, skipped: 0 },
    currentFile: 'Q4 Growth Metrics.gsheet',
  },
  {
    folderId: 'mock-folder-new',
    status: 'ingesting',
    progress: { total: 5, parsed: 5, indexed: 4, failed: 0, skipped: 0 },
    currentFile: 'Exec Team Notes.gdoc',
  },
  {
    folderId: 'mock-folder-new',
    status: 'indexed',
    progress: { total: 5, parsed: 5, indexed: 5, failed: 0, skipped: 0 },
  },
]

// ---------------------------------------------------------------------------
// Mock Q&A responses
// ---------------------------------------------------------------------------

const MOCK_CITATIONS_RESEARCH: Citation[] = [
  {
    id: 'cit-1',
    index: 1,
    fileId: 'file-research',
    fileName: 'User Research Summary.pdf',
    chunkId: 'chunk-research-1',
    chunkText:
      'In our Q3 2024 user research study (n=84), onboarding friction was cited by 67% of participants as the primary barrier to initial adoption. The average time-to-first-value was measured at 23 minutes — well above the 8-minute industry benchmark for SaaS productivity tools.',
    highlightText: '67% of participants as the primary barrier to initial adoption',
    relevanceScore: 0.94,
  },
  {
    id: 'cit-2',
    index: 2,
    fileId: 'file-competitor',
    fileName: 'Competitor Analysis.gdoc',
    chunkId: 'chunk-competitor-1',
    chunkText:
      "Data portability and export limitations represent the most-cited gap in existing solutions. Competing products offer only manual CSV exports with no real-time sync, no API access at lower tiers, and no webhook support. This is a high-value differentiator opportunity in the $45M ARR mid-market segment we're targeting.",
    highlightText: 'Data portability and export limitations represent the most-cited gap',
    relevanceScore: 0.89,
  },
  {
    id: 'cit-3',
    index: 3,
    fileId: 'file-notes',
    fileName: 'Exec Team Notes.gdoc',
    chunkId: 'chunk-notes-1',
    chunkText:
      'October 3rd exec sync: Users repeatedly mentioned difficulty locating relevant content across deeply nested folder structures. Search is broken — returns flat results with no context, forcing users to manually open files. This was raised in 4 of 6 customer advisory board sessions.',
    highlightText: 'difficulty locating relevant content across deeply nested folder structures',
    relevanceScore: 0.87,
  },
]

const MOCK_CITATIONS_COMPETITORS: Citation[] = [
  {
    id: 'cit-4',
    index: 1,
    fileId: 'file-competitor',
    fileName: 'Competitor Analysis.gdoc',
    chunkId: 'chunk-competitor-2',
    chunkText:
      "Competitor A (Notion): Strong on flexibility, weak on structured data and permissions. Enterprise adoption is limited by lack of SOC2 compliance and unreliable API. Our advantage: structured schema + enterprise-grade access control. Competitor B (Confluence): Dominant in eng/dev teams but universally described as 'heavy' and 'slow'. High churn among non-technical users. Our advantage: AI-first search reduces navigation overhead by ~60%.",
    highlightText: 'AI-first search reduces navigation overhead by ~60%',
    relevanceScore: 0.92,
  },
  {
    id: 'cit-5',
    index: 2,
    fileId: 'file-roadmap',
    fileName: 'Product Roadmap Q4 2024.gdoc',
    chunkId: 'chunk-roadmap-1',
    chunkText:
      "Q4 differentiation thesis: we win on three vectors — (1) AI-native search that understands intent, not just keywords; (2) real-time collaboration without the Notion tax; (3) seamless Google Workspace integration. These map directly to our ICP's (50–500 person knowledge-intensive companies) top unmet needs.",
    highlightText: 'AI-native search that understands intent, not just keywords',
    relevanceScore: 0.88,
  },
]

const MOCK_CITATIONS_Q4_TARGETS: Citation[] = [
  {
    id: 'cit-6',
    index: 1,
    fileId: 'file-metrics',
    fileName: 'Q4 Growth Metrics.gsheet',
    chunkId: 'chunk-metrics-1',
    chunkText:
      'Q4 2024 Targets: ARR target $4.2M (+35% YoY). New logo target: 28 enterprise accounts (≥100 seats). Net Revenue Retention (NRR) target: 118%. Trial-to-paid conversion target: 24% (up from 19% in Q3). CAC payback period target: <14 months.',
    highlightText: 'ARR target $4.2M (+35% YoY)',
    relevanceScore: 0.96,
  },
  {
    id: 'cit-7',
    index: 2,
    fileId: 'file-roadmap',
    fileName: 'Product Roadmap Q4 2024.gdoc',
    chunkId: 'chunk-roadmap-2',
    chunkText:
      "Key Q4 milestones: Ship AI Answers v2 (semantic search + citations) by Oct 15. Launch enterprise SSO + SCIM provisioning by Nov 1. Close 3 lighthouse enterprise customers for case study content by Nov 30. Reach 500 MAU milestone by Dec 31. These gate our Series A fundraise conversation starting in January.",
    highlightText: 'Ship AI Answers v2 (semantic search + citations) by Oct 15',
    relevanceScore: 0.91,
  },
]

function makeDebugInfo(query: string, citations: Citation[]): RetrievalDebugInfo {
  const allChunks = [
    ...citations.map((c, i) => ({
      chunkId: c.chunkId,
      fileId: c.fileId,
      fileName: c.fileName,
      folderId: 'mock-folder-q4-strategy',
      text: c.chunkText,
      score: c.relevanceScore,
      rank: i + 1,
      selected: true,
    })),
    // Add some "rejected" chunks for realism
    {
      chunkId: 'chunk-rejected-1',
      fileId: 'file-metrics',
      fileName: 'Q4 Growth Metrics.gsheet',
      folderId: 'mock-folder-q4-strategy',
      text: 'Monthly active users in September: 312. Churn rate: 2.1%. Gross margin: 74%.',
      score: 0.68,
      rank: citations.length + 1,
      selected: false,
    },
    {
      chunkId: 'chunk-rejected-2',
      fileId: 'file-notes',
      fileName: 'Exec Team Notes.gdoc',
      folderId: 'mock-folder-q4-strategy',
      text: 'Reminder: all-hands on October 12th at 2pm PT. Q3 retrospective deck to be shared by EOD Friday.',
      score: 0.52,
      rank: citations.length + 2,
      selected: false,
    },
  ]

  return {
    query,
    retrievedChunks: allChunks,
    selectedChunkIds: citations.map((c) => c.chunkId),
    totalRetrieved: allChunks.length,
    totalSelected: citations.length,
    retrievalLatencyMs: Math.floor(Math.random() * 60) + 40,
    generationLatencyMs: Math.floor(Math.random() * 800) + 600,
    totalLatencyMs: Math.floor(Math.random() * 860) + 650,
  }
}

function makeMetadata(citations: Citation[], confidence: AnswerMetadata['confidence']): AnswerMetadata {
  const fileIds = new Set(citations.map((c) => c.fileId))
  return {
    filesUsed: fileIds.size,
    chunksUsed: citations.length,
    confidence,
    model: 'gpt-4o',
    latencyMs: Math.floor(Math.random() * 860) + 650,
  }
}

export interface MockChatResponse {
  answer: string
  citations: Citation[]
  metadata: AnswerMetadata
  debugInfo: RetrievalDebugInfo
}

const MOCK_CITATIONS_OVERVIEW: Citation[] = [
  {
    id: 'cit-ov-1',
    index: 1,
    fileId: 'file-roadmap',
    fileName: 'Product Roadmap Q4 2024.gdoc',
    chunkId: 'chunk-roadmap-ov',
    chunkText:
      'Q4 differentiation thesis: we win on three vectors — (1) AI-native search that understands intent, not just keywords; (2) real-time collaboration without the Notion tax; (3) seamless Google Workspace integration. These map directly to our ICP\'s (50–500 person knowledge-intensive companies) top unmet needs.',
    highlightText: 'AI-native search that understands intent, not just keywords',
    relevanceScore: 0.91,
  },
  {
    id: 'cit-ov-2',
    index: 2,
    fileId: 'file-research',
    fileName: 'User Research Summary.pdf',
    chunkId: 'chunk-research-ov',
    chunkText:
      'In our Q3 2024 user research study (n=84), onboarding friction was cited by 67% of participants as the primary barrier to initial adoption. The average time-to-first-value was measured at 23 minutes — well above the 8-minute industry benchmark for SaaS productivity tools.',
    highlightText: '67% of participants as the primary barrier to initial adoption',
    relevanceScore: 0.88,
  },
  {
    id: 'cit-ov-3',
    index: 3,
    fileId: 'file-metrics',
    fileName: 'Q4 Growth Metrics.gsheet',
    chunkId: 'chunk-metrics-ov',
    chunkText:
      'Q4 2024 Targets: ARR target $4.2M (+35% YoY). New logo target: 28 enterprise accounts (≥100 seats). Net Revenue Retention (NRR) target: 118%. Trial-to-paid conversion target: 24% (up from 19% in Q3).',
    highlightText: 'ARR target $4.2M (+35% YoY)',
    relevanceScore: 0.85,
  },
]

// Keyword-matched mock responses
export function getMockResponse(question: string): MockChatResponse {
  const q = question.toLowerCase()

  // Generic "what is this / overview / summary" questions
  const isOverview =
    q.includes('overview') ||
    q.includes('summary') ||
    q.includes('summarize') ||
    q.includes('what is this') ||
    q.includes('what does this folder') ||
    q.includes('what is in this') ||
    q.includes('what\'s in this') ||
    q.includes('whats in') ||
    q.includes('tell me about') ||
    q.includes('describe') ||
    q.includes('folder contain') ||
    q.includes('folder do') ||
    q.includes('folder about') ||
    (q.includes('what') && q.includes('folder')) ||
    q === 'what does this folder do'

  if (isOverview) {
    const citations = MOCK_CITATIONS_OVERVIEW
    return {
      answer: `This folder contains **Q4 2024 product strategy materials** across 5 documents:\n\n**Product Roadmap Q4 2024** — outlines the Q4 differentiation thesis: AI-native search, real-time collaboration, and deep Google Workspace integration. Targets the 50–500 person knowledge-intensive company segment. [1]\n\n**User Research Summary** — Q3 2024 study (n=84) identifying the top user pain points: onboarding friction (67% of participants), time-to-first-value averaging 23 minutes vs. an 8-minute industry benchmark. [2]\n\n**Competitor Analysis** — detailed breakdown of positioning against Notion and Confluence, including specific differentiation vectors and market sizing.\n\n**Q4 Growth Metrics** — revenue and retention targets including $4.2M ARR (+35% YoY), 28 new enterprise logos, and 118% NRR. [3]\n\n**Exec Team Notes** — internal notes from customer advisory board sessions and leadership syncs.`,
      citations,
      metadata: makeMetadata(citations, 'high'),
      debugInfo: makeDebugInfo(question, citations),
    }
  }

  if (q.includes('pain point') || q.includes('user research') || q.includes('problem')) {
    const citations = MOCK_CITATIONS_RESEARCH
    return {
      answer: `Based on the Q4 2024 user research, three primary pain points emerge:\n\n**Onboarding friction** was cited by 67% of participants as the top barrier to adoption. The average time-to-first-value measured 23 minutes — nearly 3× the industry benchmark for SaaS tools. [1]\n\n**Data portability limitations** represent a significant gap in existing solutions. Users need real-time sync and API access that competing products don't provide at lower price tiers, creating a clear market opportunity. [2]\n\n**Search and discoverability** issues were raised in 4 of 6 customer advisory board sessions. Users struggle to locate relevant content within nested folder structures, and current search returns flat results without contextual ranking. [3]`,
      citations,
      metadata: makeMetadata(citations, 'high'),
      debugInfo: makeDebugInfo(question, citations),
    }
  }

  if (q.includes('competitor') || q.includes('competitive') || q.includes('differentiator') || q.includes('rival')) {
    const citations = MOCK_CITATIONS_COMPETITORS
    return {
      answer: `The competitive analysis identifies two primary threats and corresponding differentiators:\n\n**vs. Notion:** Notion's flexibility is a double-edged sword — it lacks structured schema and enterprise-grade access control. Our structured data model and permissions system are a key wedge in the enterprise segment. [1]\n\n**vs. Confluence:** Confluence dominates dev teams but has high churn among non-technical users who find it slow and navigation-heavy. Our AI-first search reduces navigation overhead by approximately 60%, which is the core pitch against Confluence in mixed-team environments. [1]\n\nOur Q4 differentiation thesis anchors on AI-native intent understanding, real-time collaboration without Notion's overhead, and deep Google Workspace integration — mapped directly to our ICP's top unmet needs. [2]`,
      citations,
      metadata: makeMetadata(citations, 'high'),
      debugInfo: makeDebugInfo(question, citations),
    }
  }

  if (q.includes('target') || q.includes('revenue') || q.includes('goal') || q.includes('metric') || q.includes('okr') || q.includes('q4')) {
    const citations = MOCK_CITATIONS_Q4_TARGETS
    return {
      answer: `The Q4 2024 targets are:\n\n**Revenue:** ARR target of $4.2M, representing 35% YoY growth. New logo target of 28 enterprise accounts (≥100 seats). [1]\n\n**Retention:** Net Revenue Retention (NRR) target of 118%, up from 109% in Q3. Trial-to-paid conversion target of 24% (from 19% in Q3). [1]\n\n**Product milestones gating the Series A:** AI Answers v2 shipping by Oct 15, enterprise SSO + SCIM by Nov 1, and 3 lighthouse enterprise customers closed for case study content by Nov 30. [2]`,
      citations,
      metadata: makeMetadata(citations, 'high'),
      debugInfo: makeDebugInfo(question, citations),
    }
  }

  // Fallback: unsupported answer
  return {
    answer: `I wasn't able to find strong evidence in the indexed folder to answer that specific question. The folder contains product strategy documents, user research, competitive analysis, Q4 metrics, and exec team notes — but the documents don't appear to address this particular topic directly.\n\nTry rephrasing your question, or ask about: user pain points, competitive landscape, Q4 targets, or product roadmap priorities.`,
    citations: [],
    metadata: {
      filesUsed: 0,
      chunksUsed: 0,
      confidence: 'unsupported',
      confidenceReason: 'No chunks exceeded the relevance threshold of 0.65',
      model: 'gpt-4o',
      latencyMs: 234,
    },
    debugInfo: {
      query: question,
      retrievedChunks: [
        {
          chunkId: 'chunk-low-1',
          fileId: 'file-notes',
          fileName: 'Exec Team Notes.gdoc',
          folderId: 'mock-folder-q4-strategy',
          text: 'Reminder: all-hands on October 12th at 2pm PT.',
          score: 0.41,
          rank: 1,
          selected: false,
        },
        {
          chunkId: 'chunk-low-2',
          fileId: 'file-metrics',
          fileName: 'Q4 Growth Metrics.gsheet',
          folderId: 'mock-folder-q4-strategy',
          text: 'Monthly active users September: 312.',
          score: 0.38,
          rank: 2,
          selected: false,
        },
      ],
      selectedChunkIds: [],
      totalRetrieved: 2,
      totalSelected: 0,
      retrievalLatencyMs: 38,
      generationLatencyMs: 196,
      totalLatencyMs: 234,
    },
  }
}

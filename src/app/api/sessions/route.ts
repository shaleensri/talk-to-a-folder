import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/sessions
 * Returns the authenticated user's recent chat sessions with messages,
 * used to restore tab state after page reload.
 */
export async function GET() {
  const authSession = await getServerSession(authOptions)
  if (!authSession?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dbSessions = await prisma.chatSession.findMany({
    where: { userId: authSession.user.id },
    orderBy: { updatedAt: 'desc' },
    take: 20,
    include: {
      folders: {
        select: { folderId: true },
      },
      messages: {
        orderBy: { createdAt: 'asc' },
        take: 200,
      },
    },
  })

  const sessions = dbSessions
    // Drop sessions whose folders have all been deleted
    .filter((s) => s.folders.length > 0)
    .map((s) => ({
      id: s.id,
      folderIds: s.folders.map((f) => f.folderId),
      messages: s.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        citations: m.citations ? JSON.parse(m.citations) : undefined,
        metadata: m.metadata ? JSON.parse(m.metadata) : undefined,
        debugInfo: m.debugInfo ? JSON.parse(m.debugInfo) : undefined,
        createdAt: m.createdAt,
      })),
    }))

  return Response.json({ sessions })
}

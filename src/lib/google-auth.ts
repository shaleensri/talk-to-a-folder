import { prisma } from './prisma'

/**
 * Returns a valid Google access token for the given user.
 * If the stored token is expired, uses the refresh token to get a new one
 * and persists it back to the DB.
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: 'google' },
    select: {
      id: true,
      access_token: true,
      refresh_token: true,
      expires_at: true,
    },
  })

  if (!account?.access_token) {
    throw new Error('Google account not linked. Please sign in again.')
  }

  // expires_at is Unix seconds. Give a 60-second buffer before treating as expired.
  const isExpired =
    account.expires_at != null && account.expires_at - 60 < Math.floor(Date.now() / 1000)

  if (!isExpired) {
    return account.access_token
  }

  if (!account.refresh_token) {
    throw new Error('Access token expired and no refresh token available. Please sign in again.')
  }

  // Exchange refresh token for a new access token
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: account.refresh_token,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to refresh Google token: ${err}`)
  }

  const tokens = await res.json()
  const newAccessToken: string = tokens.access_token
  const newExpiresAt: number = Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 3600)

  // Persist the refreshed token
  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: newAccessToken,
      expires_at: newExpiresAt,
    },
  })

  return newAccessToken
}

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/** Issues short-lived tokens so the browser can upload art straight to Vercel Blob (no 4.5 MB limit). */
export async function POST(req: Request) {
  const body = (await req.json()) as HandleUploadBody
  try {
    const out = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith('jobs/')) throw new Error('bad path')
        return {
          allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/tiff'],
          maximumSizeInBytes: 300 * 1024 * 1024,
          addRandomSuffix: true,
        }
      },
    })
    return NextResponse.json(out)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'upload failed' }, { status: 400 })
  }
}

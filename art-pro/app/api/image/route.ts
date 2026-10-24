import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Image models, best first. ART_PRO_IMAGE_MODEL (if set) is tried before these. */
const PREFERRED_MODELS = ['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini']
const NO_MODEL_HELP =
  'This OpenAI account cannot use any image model yet. Ask Ed to verify the organization at platform.openai.com → Settings → Organization → Verify and check that the project the API key belongs to allows image models.'
/** The OpenAI key, under the standard name or the name it was saved with in Vercel. */
const openaiKey = () => process.env.OPENAI_API_KEY || process.env.open_ai || process.env.OPEN_AI || ''
// Real-ESRGAN on Replicate (pinned version; override with REPLICATE_UPSCALE_VERSION).
const UPSCALE_VERSION = process.env.REPLICATE_UPSCALE_VERSION || 'f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa'

const PRINT_STYLE =
  'Print-ready artwork for DTF transfers and screen printing on apparel. Crisp clean edges, bold readable shapes, strong contrast, the design isolated on its own with nothing around it: no t-shirt, no mockup, no model, no scene, no frame, no watermark.'

const SIZES: Record<string, string> = { square: '1024x1024', portrait: '1024x1536', landscape: '1536x1024' }

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function dataUrlToBlob(dataUrl: string) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl)
  if (!m) throw new Error('bad image')
  return new Blob([Buffer.from(m[2], 'base64')], { type: m[1] })
}

type OpenAiImage = { data?: { b64_json?: string; url?: string }[]; error?: { message?: string } }

function openAiResult(j: OpenAiImage) {
  const first = j.data?.[0]
  if (first?.b64_json) return { image: `data:image/webp;base64,${first.b64_json}` }
  if (first?.url) return { url: first.url }
  throw new Error(j.error?.message || 'No image returned')
}

/** A message the shop can act on; the raw OpenAI text stays in the server log. */
class FriendlyError extends Error {}

let modelCache: { models: string[]; at: number } | null = null

/**
 * The image models this key can actually use, best first. Asks OpenAI once (cached 10 minutes)
 * instead of guessing a name: a guessed name that doesn't exist is what caused
 * "The model `gpt-image-1` does not exist".
 */
async function imageModels(): Promise<string[]> {
  if (modelCache && Date.now() - modelCache.at < 10 * 60_000) return modelCache.models
  const wanted = [process.env.ART_PRO_IMAGE_MODEL, ...PREFERRED_MODELS].filter((m, i, a): m is string => !!m && a.indexOf(m) === i)
  let models = wanted
  try {
    const r = await fetch('https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${openaiKey()}` } })
    if (r.ok) {
      const j = (await r.json()) as { data?: { id: string }[] }
      const have = new Set((j.data || []).map((m) => m.id))
      models = wanted.filter((m) => have.has(m))
      // Any other image model this key has (e.g. a newer name) goes last.
      for (const id of have) if (/^gpt-image/.test(id) && !models.includes(id)) models.push(id)
    } else if (r.status === 401) {
      throw new FriendlyError('The OpenAI key in Vercel was rejected. Make a new key at platform.openai.com → API keys and update OPENAI_API_KEY.')
    }
  } catch (e) {
    if (e instanceof FriendlyError) throw e
    console.error('could not list OpenAI models; trying the preferred list', e)
  }
  modelCache = { models, at: Date.now() }
  return models
}

const MODEL_PROBLEM = /model|does not exist|not found|access|verif|organization/i

/** Runs an OpenAI image call on the best model this key can use, moving down the list only on model-access errors. */
async function withModel<T>(run: (model: string) => Promise<T>) {
  const models = await imageModels()
  if (!models.length) throw new FriendlyError(NO_MODEL_HELP)
  let first: unknown = null
  for (const model of models) {
    try {
      return await run(model)
    } catch (e) {
      const m = e instanceof Error ? e.message : ''
      console.error(`image model ${model} failed:`, m)
      first ??= e
      if (!MODEL_PROBLEM.test(m)) throw e
    }
  }
  modelCache = null
  const m = first instanceof Error ? first.message : ''
  throw new FriendlyError(/verif|organization/i.test(m) ? NO_MODEL_HELP : `${NO_MODEL_HELP} (OpenAI said: ${m})`)
}

async function create(prompt: string, transparent: boolean, shape: string, model: string) {
  const key = openaiKey()
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      prompt: `${prompt}\n\n${PRINT_STYLE}`,
      size: SIZES[shape] || SIZES.portrait,
      quality: 'high',
      background: transparent ? 'transparent' : 'auto',
      output_format: 'webp',
      output_compression: 95,
      n: 1,
    }),
  })
  const j = (await r.json()) as OpenAiImage
  if (!r.ok) throw new Error(j.error?.message || `OpenAI error ${r.status}`)
  return openAiResult(j)
}

async function redraw(image: string, prompt: string, transparent: boolean, shape: string, model: string, exact = false) {
  const key = openaiKey()
  const form = new FormData()
  const blob = dataUrlToBlob(image)
  form.append('model', model)
  form.append('image', blob, blob.type === 'image/webp' ? 'art.webp' : 'art.png')
  form.append(
    'prompt',
    exact
      ? `Recreate this exact image at higher quality for a large print. Do not change anything: same design, same text and spelling, same colors, same layout, same proportions. Only make edges, lines and lettering sharp and clean and remove blur, noise and compression artifacts.\n\n${PRINT_STYLE}`
      : `Redraw this exact design as clean, sharp, high-resolution print artwork. Keep the same layout, text, colors and characters unless told otherwise. ${prompt || ''}\n\n${PRINT_STYLE}`,
  )
  form.append('size', SIZES[shape] || SIZES.square)
  form.append('quality', 'high')
  form.append('background', transparent ? 'transparent' : 'auto')
  form.append('output_format', 'webp')
  form.append('output_compression', '95')
  const r = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form })
  const j = (await r.json()) as OpenAiImage
  if (!r.ok) throw new Error(j.error?.message || `OpenAI error ${r.status}`)
  return openAiResult(j)
}

type Prediction = { status: string; output?: string | string[]; error?: string; urls?: { get?: string } }

async function upscale(image: string, scale: number) {
  const token = process.env.REPLICATE_API_TOKEN!
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}`, prefer: 'wait=60' }
  const r = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ version: UPSCALE_VERSION, input: { image, scale: Math.min(4, Math.max(2, scale)), face_enhance: false } }),
  })
  let p = (await r.json()) as Prediction & { detail?: string }
  if (!r.ok) throw new Error(p.detail || p.error || `Replicate error ${r.status}`)
  const until = Date.now() + 250_000
  while (!['succeeded', 'failed', 'canceled'].includes(p.status) && p.urls?.get && Date.now() < until) {
    await new Promise((ok) => setTimeout(ok, 2000))
    p = (await (await fetch(p.urls.get, { headers: { authorization: `Bearer ${token}` } })).json()) as Prediction
  }
  if (p.status !== 'succeeded') throw new Error(p.error || 'Upscale did not finish')
  const out = Array.isArray(p.output) ? p.output[0] : p.output
  if (!out) throw new Error('Upscale returned nothing')
  return { url: out }
}

export async function POST(req: Request) {
  let body: { op?: string; prompt?: string; image?: string; transparent?: boolean; shape?: string; scale?: number }
  const key = openaiKey()
  try {
    body = await req.json()
  } catch {
    return err('bad request')
  }
  try {
    if (body.op === 'create' || body.op === 'redraw') {
      if (!key) return err('AI image creation is not switched on yet (OpenAI key missing in Vercel).', 503)
      if (body.op === 'create') {
        if (!body.prompt?.trim()) return err('Describe the art you want.')
        const prompt = body.prompt.slice(0, 4000)
        return NextResponse.json(await withModel((m) => create(prompt, body.transparent !== false, body.shape || 'portrait', m)))
      }
      if (!body.image) return err('No image sent.')
      const image = body.image
      return NextResponse.json(await withModel((m) => redraw(image, (body.prompt || '').slice(0, 2000), body.transparent !== false, body.shape || 'square', m)))
    }
    if (body.op === 'upscale') {
      if (!body.image) return err('No image sent.')
      if (process.env.REPLICATE_API_TOKEN) return NextResponse.json(await upscale(body.image, body.scale || 4))
      // No Replicate: OpenAI recreates the same art sharp and clean; the browser enlarges it to print size.
      if (!key) return err('AI upscaling is not switched on yet (no OpenAI or Replicate key in Vercel).', 503)
      const image = body.image
      const r = await withModel((m) => redraw(image, '', body.transparent !== false, body.shape || 'square', m, true))
      return NextResponse.json({ ...r, enlarge: true })
    }
    return err('unknown op')
  } catch (e) {
    console.error('image op failed', body.op, e)
    return err(e instanceof Error ? e.message : 'Image service failed', 502)
  }
}

/** Status of the AI image tools, or a pass-through download for upscale results (Replicate files only). */
export async function GET(req: Request) {
  const proxy = new URL(req.url).searchParams.get('proxy')
  if (proxy) {
    let u: URL
    try {
      u = new URL(proxy)
    } catch {
      return err('bad url')
    }
    if (u.protocol !== 'https:' || !(u.hostname === 'replicate.delivery' || u.hostname.endsWith('.replicate.delivery'))) return err('not allowed', 403)
    const up = await fetch(u)
    if (!up.ok || !up.body) return err('download failed', 502)
    return new Response(up.body, { headers: { 'content-type': up.headers.get('content-type') || 'image/png', 'cache-control': 'no-store' } })
  }
  const models = openaiKey() ? await imageModels().catch(() => []) : []
  return NextResponse.json({ create: Boolean(openaiKey()), upscale: Boolean(process.env.REPLICATE_API_TOKEN || openaiKey()), upscaleVia: process.env.REPLICATE_API_TOKEN ? 'replicate' : openaiKey() ? 'openai' : null, model: models[0] || null })
}

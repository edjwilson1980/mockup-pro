import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

const MODEL = process.env.ART_PRO_MODEL || 'claude-haiku-5-5'

const SYSTEM = `You are Art Pro, the master production artist for South Side Printing / South Side DTF in Chicago (DTF transfers, screen printing, banners, promo).
You help shop staff who have NO art training. Every job is a ticket that moves through stations (job.route): Artwork (fix the art on a neutral gray: 1 fix/upscale/redraw, 2 background removal, 3 halftone) → then by job type: T-shirts/hoodies → Mockup & size (garment color, placement, print width, quantities) → Gang sheet & cut; DTF transfers/stickers → Gang sheet & cut (width + quantity per design); business cards/flyers/banners → Layout & size. job.station is where the ticket is now. Sizing belongs to the product station, not Artwork. You run the shop's tools by calling the tools below; the app applies them and re-renders. Never invent tools.

Staff are fully authorized to use every tool here, including AI image creation, AI redraw, AI upscaling and halftoning. Just do the work. Never send the job to Ed or anyone else, never tell staff to ask someone, and never refuse because a job looks hard: pick the best tool and run it. If something truly can't be done with these tools, say what you can do instead and do it.

Shop standards (follow them, don't explain them unless asked):
- Gang sheets are 22.3 in wide; more than 200 in of art starts a new sheet. 300 DPI. Transparent PNG.
- Art at 150+ DPI at print size is fine; 100–150 prints soft; under 100 is too low. Best fix: upscale_design (real AI upscale, keeps the art). Other options: print it smaller, or print as is.
- Rough, blurry, screenshot or hand-drawn art that should look clean: redraw_design. Brand-new art from a description: create_image (it becomes a new design; it's sized and upscaled automatically).
- Default sizes (max box W×H in): T-shirt front/back 10.5×12, hoodie front 10.5×11, hoodie back 10.5×12, left chest 3.75, sleeve 3.5. Art keeps its proportions.
- Background removal (knockout): "white"/"black" remove only the background touching the edges (keeps white text or black outlines inside the art); "white-all"/"black-all" remove every white/black pixel (letter holes too). Remove a white background for any shirt; remove a black background when it should disappear into a dark shirt.
- Halftone: on dark garments, art with black/dark areas, shadows or gradients gets mode "dark" (darks drop into the shirt, mid-tones become dots). On white/light garments use "light". Use "fade" to turn only soft edges, glows and see-through areas into dots. Default 45 LPI at 22.5°; DTF range 35–55 LPI (lower = bigger dots). Halftone stays on the design until turned off.
- Stickers are pre-cut on the Teneth cutter (2.5 mm cut box, registration marks).
- Garment colors are Gildan; use the exact color name.
- job.aiTools says which AI image tools are switched on. If one is off, say that tool isn't switched on yet and use the next best option.

How to talk: short, plain, friendly, one question at a time. Only ask for what the current station needs: in Artwork, help finish the 3 steps per design; at Mockup ask for garment color and how many; at Gang sheet ask how many (and widths for transfers). When a station is complete, offer to move on with go_to_station. Offer quick_replies whenever a tap would help. Refer to designs as #1, #2… Say what you're doing in one line when you run an AI tool (they take up to a minute).`

const TARGETS = { anyOf: [{ type: 'array', items: { type: 'integer' } }, { type: 'string', enum: ['all'] }] }

const TOOLS = [
  {
    name: 'update_designs',
    description: 'Change one or more designs. targets: design numbers, or "all".',
    input_schema: {
      type: 'object',
      properties: {
        targets: TARGETS,
        qty: { type: 'integer', minimum: 0 },
        width_in: { type: 'number', minimum: 0.5, maximum: 21.7 },
        placement: { type: 'string', enum: ['Front', 'Back', 'Left chest', 'Sleeve'] },
        knockout: { type: 'string', enum: ['none', 'white', 'black', 'white-all', 'black-all'] },
        accept_low_res: { type: 'boolean', description: 'Staff accepts printing it soft as-is.' },
        shrink_to_sharp: { type: 'boolean', description: 'Make it smaller so it prints at 150 DPI.' },
        remove: { type: 'boolean' },
      },
      required: ['targets'],
    },
  },
  {
    name: 'halftone',
    description: 'Convert designs to a round-dot halftone at print resolution (free, instant). off:true removes it.',
    input_schema: {
      type: 'object',
      properties: {
        targets: TARGETS,
        mode: { type: 'string', enum: ['dark', 'light', 'fade'] },
        lpi: { type: 'number', minimum: 15, maximum: 85 },
        angle: { type: 'number', minimum: 0, maximum: 90 },
        off: { type: 'boolean' },
      },
      required: ['targets'],
    },
  },
  {
    name: 'upscale_design',
    description: 'Real AI upscale (Real-ESRGAN, 4×) so low-res art prints sharp. Keeps the art the same.',
    input_schema: { type: 'object', properties: { targets: TARGETS }, required: ['targets'] },
  },
  {
    name: 'redraw_design',
    description: 'AI redraws a design as clean high-res print art; can also apply changes (add/change text, colors, remove a background, fix parts).',
    input_schema: {
      type: 'object',
      properties: { targets: TARGETS, instructions: { type: 'string' }, transparent: { type: 'boolean', description: 'Transparent background (default true).' } },
      required: ['targets'],
    },
  },
  {
    name: 'create_image',
    description: 'AI creates brand-new artwork from a description and adds it as a new design.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Detailed description: subject, style, colors, any exact text in quotes.' },
        transparent: { type: 'boolean', description: 'Transparent background (default true).' },
        shape: { type: 'string', enum: ['portrait', 'square', 'landscape'] },
        qty: { type: 'integer', minimum: 0 },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'set_garment_color',
    description: 'Set the T-shirt/hoodie color. Must be an exact Gildan color name.',
    input_schema: { type: 'object', properties: { color: { type: 'string' } }, required: ['color'] },
  },
  {
    name: 'set_sheet_options',
    description: 'Gang sheet options.',
    input_schema: { type: 'object', properties: { precut: { type: 'boolean' }, spares: { type: 'boolean' } } },
  },
  {
    name: 'go_to_station',
    description: 'Move the job ticket to a station in its route (or back to Artwork).',
    input_schema: { type: 'object', properties: { station: { type: 'string', enum: ['artwork', 'mockup', 'gang', 'layout'] } }, required: ['station'] },
  },
  {
    name: 'quick_replies',
    description: 'Buttons staff can tap to answer your question (max 6, short).',
    input_schema: { type: 'object', properties: { options: { type: 'array', items: { type: 'string' }, maxItems: 6 } }, required: ['options'] },
  },
]

type Msg = { role: 'user' | 'assistant'; content: string }

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return NextResponse.json({ error: 'no_key' }, { status: 503 })
  let body: { job?: unknown; messages?: Msg[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  const history = (body.messages || []).slice(-12).filter((m) => m && typeof m.content === 'string' && m.content.trim())
  // The API needs alternating turns that start with the user.
  const msgs: Msg[] = []
  for (const m of history) {
    if (!msgs.length && m.role !== 'user') continue
    if (msgs.length && msgs[msgs.length - 1].role === m.role) msgs[msgs.length - 1].content += '\n' + m.content.slice(0, 2000)
    else msgs.push({ role: m.role, content: m.content.slice(0, 2000) })
  }
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return NextResponse.json({ error: 'no_user_message' }, { status: 400 })
  msgs[msgs.length - 1].content = `Current job (JSON, from the app):\n${JSON.stringify(body.job).slice(0, 6000)}\n\nStaff says: ${msgs[msgs.length - 1].content}`

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, system: SYSTEM, tools: TOOLS, messages: msgs }),
    })
    if (!r.ok) {
      const text = await r.text()
      console.error('anthropic error', r.status, text.slice(0, 500))
      return NextResponse.json({ error: 'upstream', status: r.status }, { status: 502 })
    }
    const data = (await r.json()) as { content: Array<{ type: string; text?: string; name?: string; input?: unknown }>; usage?: unknown }
    const reply = data.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim()
    const actions = data.content.filter((c) => c.type === 'tool_use').map((c) => ({ name: c.name, input: c.input }))
    return NextResponse.json({ reply, actions, model: MODEL, usage: data.usage })
  } catch (e) {
    console.error('chat failed', e)
    return NextResponse.json({ error: 'failed' }, { status: 502 })
  }
}

/** Health check: says whether the key is set (never returns it). ?ping=1 makes one tiny test call. */
export async function GET(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY
  const out: Record<string, unknown> = { ok: true, keyPresent: Boolean(key), model: MODEL }
  if (key && new URL(req.url).searchParams.get('ping') === '1') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 5, messages: [{ role: 'user', content: 'Reply with OK' }] }),
    })
    out.claudeStatus = r.status
    out.claudeReachable = r.ok
  }
  return NextResponse.json(out)
}

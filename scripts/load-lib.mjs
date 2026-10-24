// Loads a lib/*.ts file in plain Node (22.18+ / 24 run TypeScript directly).
// Node can't resolve the app's "@/lib/…" paths, so each file is copied to
// scripts/.cache with its imports pointed at real files (JSON gets its import
// attribute), then imported.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cache = join(root, 'scripts', '.cache')
const done = new Map()

function prepare(rel) {
  if (done.has(rel)) return done.get(rel)
  const out = join(cache, rel.replace(/\.ts$/, '.mts'))
  done.set(rel, out)
  const src = readFileSync(join(root, rel), 'utf8')
  const code = src.replace(
    /from\s+(['"])(@\/|\.\.?\/)([^'"]+)\1(\s+with\s*\{[^}]*\})?/g,
    (_m, _q, pre, p) => {
      const target = pre === '@/' ? p : posix.normalize(posix.join(posix.dirname(rel), pre + p))
      if (target.endsWith('.json')) return `from '${pathToFileURL(join(root, target)).href}' with { type: 'json' }`
      const file = target.endsWith('.ts') ? target : `${target}.ts`
      return `from '${pathToFileURL(prepare(file)).href}'`
    },
  )
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, code)
  return out
}

export async function loadLib(rel) {
  return import(pathToFileURL(prepare(rel)).href)
}

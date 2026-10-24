// Server-only: Mockup Pro records in the shared mp_records table.
import { db } from './db'
import type { MpAsset, MpCustomer, MpOrder } from './mp-types'

type Row<T> = { kind: string; id: string; customer_id: string; data: T; updated_at: string }

export async function mpGet<T>(kind: 'order' | 'asset' | 'customer', ids: (string | null | undefined)[]): Promise<T[]> {
  // Orders can have empty print spots (customer hasn't uploaded art yet), so skip missing ids.
  const clean = [...new Set(ids.filter((i): i is string => typeof i === 'string' && i.length > 0))]
  if (!clean.length) return []
  const list = clean.map((i) => `"${i.replace(/"/g, '')}"`).join(',')
  const rows = (await db(`mp_records?kind=eq.${kind}&id=in.(${encodeURIComponent(list)})&select=data`)) as Row<T>[]
  return rows.map((r) => r.data)
}

export async function mpPut(kind: 'order' | 'asset', id: string, customerId: string, data: MpOrder | MpAsset, exists: boolean) {
  const row = { kind, id, customer_id: customerId, data, updated_at: new Date().toISOString() }
  if (exists) await db(`mp_records?kind=eq.${kind}&id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ data, updated_at: row.updated_at }) })
  else await db('mp_records', { method: 'POST', body: JSON.stringify(row) })
}

export async function mpCustomers(q: string): Promise<MpCustomer[]> {
  const s = q.replace(/[^\p{L}\p{N} @.+-]/gu, '').trim()
  const filter = s ? `&or=(data->>name.ilike.*${encodeURIComponent(s)}*,data->>fileNo.ilike.*${encodeURIComponent(s)}*,data->>org.ilike.*${encodeURIComponent(s)}*,data->>phone.ilike.*${encodeURIComponent(s)}*)` : ''
  const rows = (await db(`mp_records?kind=eq.customer${filter}&select=data&order=updated_at.desc&limit=12`)) as Row<MpCustomer>[]
  return rows.map(({ data: c }) => ({ id: c.id, name: c.name, org: c.org, fileNo: c.fileNo, phone: c.phone }))
}

export const hex8 = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('')

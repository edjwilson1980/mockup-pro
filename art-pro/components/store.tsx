'use client'
import { createContext, useContext, useState, type ReactNode } from 'react'
import type { GangItem, PackOptions } from '@/lib/pack'

export type Tab = 'jobs' | 'customers' | 'job' | 'gang' | 'cutter'

export type ApprovedJob = {
  id: string
  customer: string
  productLabel: string
  garment?: string
  mockupUrl: string
  printUrl: string
  widthIn: number
  heightIn: number
  qty: number
  approvedAt: string
}

type Store = {
  tab: Tab
  setTab: (t: Tab) => void
  jobs: ApprovedJob[]
  approve: (job: ApprovedJob) => void
  gang: GangItem[]
  setGang: (fn: (g: GangItem[]) => GangItem[]) => void
  customer: string
  setCustomer: (c: string) => void
  opts: PackOptions
  setOpts: (o: Partial<PackOptions>) => void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<Tab>('jobs')
  const [jobs, setJobs] = useState<ApprovedJob[]>([])
  const [gang, setGangState] = useState<GangItem[]>([])
  const [customer, setCustomer] = useState('')
  const [opts, setOptsState] = useState<PackOptions>({ precut: false, gapIn: 0.25, spares: false, rotate: true })
  const store: Store = {
    tab,
    setTab,
    jobs,
    approve: (job) => {
      setJobs((j) => [job, ...j])
      // Approved mockup → gang sheet: the approved print goes straight onto the sheet queue.
      setGangState((g) => [
        ...g,
        { id: `${job.id}-print`, jobId: job.id, label: `${job.customer || 'Customer'} · ${job.productLabel}`, src: job.printUrl, widthIn: job.widthIn, heightIn: job.heightIn, qty: job.qty },
      ])
      if (job.customer) setCustomer(job.customer)
    },
    gang,
    setGang: (fn) => setGangState(fn),
    customer,
    setCustomer,
    opts,
    setOpts: (o) => setOptsState((cur) => ({ ...cur, ...o })),
  }
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider missing')
  return s
}

export const uid = () => Math.random().toString(36).slice(2, 10)

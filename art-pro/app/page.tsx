'use client'
import { useEffect, useState } from 'react'
import { StoreProvider, useStore, type Tab } from '@/components/store'
import JobTab from '@/components/JobTab'
import GangTab from '@/components/GangTab'
import CutterTab from '@/components/CutterTab'
import JobsHome from '@/components/jobs/JobsHome'
import JobView from '@/components/jobs/JobView'
import CustomerProfile, { OrderLink, currentCustomer, rememberCustomer, type CurrentCustomer } from '@/components/jobs/CustomersTab'
import { SHEET_WIDTH_IN } from '@/lib/sheet-size'
import './jobs.css'

const TABS: { id: Tab; label: string }[] = [
  { id: 'jobs', label: 'Jobs' },
  { id: 'job', label: 'Tools: quick mockup' },
  { id: 'gang', label: 'Tools: gang sheet' },
  { id: 'cutter', label: 'Tools: cutter' },
]

function Shell() {
  const { tab, setTab } = useStore()
  const [openId, setOpenId] = useState<string | null>(null)
  const [orderRef, setOrderRef] = useState<string | null>(null)
  const [custRef, setCustRef] = useState<string | null>(null)
  const [cust, setCust] = useState<CurrentCustomer | null>(null)

  useEffect(() => {
    const sync = () => setCust(currentCustomer())
    window.addEventListener('artpro-customer', sync)
    sync()
    return () => window.removeEventListener('artpro-customer', sync)
  }, [])

  // Keep the open job in the address bar so a refresh (or a shared link) lands on it.
  useEffect(() => {
    const read = () => {
      setOpenId(/job=([0-9a-f-]{36})/i.exec(location.hash)?.[1] || null)
      setOrderRef(/order=((?:MP-\d{1,9})|(?:ord-[\w-]{1,40}))/i.exec(location.hash)?.[1] || null)
      const c = /customer=(C-[\w-]{1,20})/i.exec(location.hash)?.[1] || null
      setCustRef(c)
      if (c) setTab('customers')
    }
    // Came here from a Mockup Pro customer file (its "Mockup studio" link)? Open that customer.
    if (!location.hash) {
      try {
        const r = new URL(document.referrer)
        const f = r.origin === location.origin && /^\/shop\/customers\/(C-[\w-]{1,20})/i.exec(r.pathname)?.[1]
        if (f) history.replaceState(null, '', `#customer=${f}`)
        else rememberCustomer(null) // opened from somewhere else in the shop: no customer yet
      } catch {}
    }
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const open = (id: string | null) => {
    location.hash = id ? `job=${id}` : ''
    setOpenId(id)
    setOrderRef(null)
    setCustRef(null)
    setTab('jobs')
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <div className="logo">SSP</div>
          <div>
            <div className="name">Art Pro</div>
            <div className="muted small">South Side Printing · art department</div>
          </div>
        </div>
        <a className="backshop" href="/shop">‹ Shop</a>
        <nav className="nav" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => (t.id === 'jobs' ? open(null) : setTab(t.id))}>
              {t.label}
            </button>
          ))}
        </nav>
        {cust ? (
          <a className="custchip" href={`#customer=${cust.fileNo}`} title="Back to this customer's orders">
            <strong>{cust.name}</strong><span className="muted small">{cust.fileNo}</span>
          </a>
        ) : (
          <span className="status"><i />{SHEET_WIDTH_IN}&quot; sheets · Teneth CCD</span>
        )}
      </header>
      <main className="main">
        {tab === 'jobs' && (orderRef && !openId ? <OrderLink orderRef={orderRef} onOpen={(id) => open(id)} onCancel={() => open(null)} /> : openId ? <JobView key={openId} id={openId} onClose={() => open(null)} /> : <JobsHome onOpen={(id) => open(id)} />)}
        {tab === 'customers' && custRef && <CustomerProfile fileRef={custRef} onOpen={(id) => open(id)} />}
        <div hidden={tab !== 'job'}><JobTab /></div>
        <div hidden={tab !== 'gang'}><GangTab /></div>
        {tab === 'cutter' && <CutterTab />}
      </main>
    </div>
  )
}

export default function Page() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}

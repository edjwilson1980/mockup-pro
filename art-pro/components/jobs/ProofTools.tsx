'use client'

export const PROOF_BGS = [
  { name: 'White', hex: '#ffffff' },
  { name: 'Black', hex: '#000000' },
  { name: 'Navy', hex: '#1f2a44' },
  { name: 'Gray', hex: '#808080' },
]
export const ZOOMS = [0.5, 1, 1.5, 2, 3, 4, 6, 8]
export const bgName = (hex: string) => PROOF_BGS.find((b) => b.hex === hex.toLowerCase())?.name || hex

type Props = {
  bg: string
  setBg?: (hex: string) => void
  zoom: number
  setZoom: (z: number) => void
  downloads: { label: string; run: () => void }[]
  busy?: string
  bgLabel?: string
}

/** Toolbar under a proof: background color, zoom, download. */
export default function ProofTools(p: Props) {
  const i = ZOOMS.indexOf(p.zoom)
  return (
    <div className="prooftools">
      {p.setBg && (
        <div className="ptgroup">
          <span className="lbl">{p.bgLabel || 'Background'}</span>
          {PROOF_BGS.map((b) => (
            <button key={b.hex} type="button" className={`bgsw ${p.bg.toLowerCase() === b.hex ? 'on' : ''}`} style={{ background: b.hex }} title={b.name} aria-label={`${b.name} background`} onClick={() => p.setBg!(b.hex)} />
          ))}
          <label className={`bgsw pick ${PROOF_BGS.some((b) => b.hex === p.bg.toLowerCase()) ? '' : 'on'}`} title="Pick any color" style={{ background: PROOF_BGS.some((b) => b.hex === p.bg.toLowerCase()) ? undefined : p.bg }}>
            <input type="color" value={p.bg} onChange={(e) => p.setBg!(e.target.value)} aria-label="Pick any background color" />
            <span aria-hidden="true">+</span>
          </label>
          <span className="muted small">{bgName(p.bg)}</span>
        </div>
      )}
      <div className="ptgroup">
        <span className="lbl">Zoom</span>
        <button type="button" className="zbtn" disabled={i <= 0} onClick={() => p.setZoom(ZOOMS[Math.max(0, i - 1)])} aria-label="Zoom out">−</button>
        <button type="button" className="zval" onClick={() => p.setZoom(1)} title="Fit">{p.zoom === 1 ? 'Fit' : `${Math.round(p.zoom * 100)}%`}</button>
        <button type="button" className="zbtn" disabled={i >= ZOOMS.length - 1} onClick={() => p.setZoom(ZOOMS[Math.min(ZOOMS.length - 1, i + 1)])} aria-label="Zoom in">+</button>
      </div>
      <div className="ptgroup">
        {p.downloads.map((d) => (
          <button key={d.label} type="button" className="btn small" disabled={!!p.busy} onClick={d.run}>⤓ {d.label}</button>
        ))}
        {p.busy && <span className="muted small">{p.busy}</span>}
      </div>
    </div>
  )
}

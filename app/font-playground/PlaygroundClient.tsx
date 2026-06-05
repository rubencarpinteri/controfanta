'use client'

import { useState } from 'react'

const FONTS = [
  { label: 'Anton',               varName: '--pg-anton' },
  { label: 'Oswald',              varName: '--pg-oswald' },
  { label: 'JetBrains Mono',      varName: '--pg-jetbrains' },
  { label: 'IBM Plex Sans',       varName: '--pg-ibmplex' },
  { label: 'Libre Baskerville',   varName: '--pg-libre' },
  { label: 'Inter',               varName: '--pg-inter' },
  { label: 'Karla',               varName: '--pg-karla' },
  { label: 'Source Sans 3',       varName: '--pg-source' },
  { label: 'Lora',                varName: '--pg-lora' },
  { label: 'Ultra',               varName: '--pg-ultra' },
  { label: 'Bevan',               varName: '--pg-bevan' },
  { label: 'Albert Sans',         varName: '--pg-albert' },
  { label: 'Bricolage Grotesque', varName: '--pg-bricolage' },
  { label: 'DM Sans',             varName: '--pg-dmsans' },
  { label: 'Fraunces',            varName: '--pg-fraunces' },
  { label: 'Hanken Grotesk',      varName: '--pg-hanken' },
  { label: 'Manrope',             varName: '--pg-manrope' },
  { label: 'Righteous',           varName: '--pg-righteous' },
  { label: 'Space Grotesk',       varName: '--pg-spacegrotesk' },
  { label: 'Space Mono',          varName: '--pg-spacemono' },
]

const LIGHT = { '--pg-bg': '#f4f5f7', '--pg-surface': '#ffffff', '--pg-border': 'rgba(0,0,0,0.09)', '--pg-ink1': '#0d0e12', '--pg-ink2': '#3d3f4a', '--pg-ink3': '#6b6e7e', '--pg-accent': '#4f46e5', '--pg-accent-soft': '#eef2ff' }
const DARK  = { '--pg-bg': '#0f1117', '--pg-surface': '#181b24', '--pg-border': 'rgba(255,255,255,0.08)', '--pg-ink1': '#f0f1f5', '--pg-ink2': '#a0a3b1', '--pg-ink3': '#636678', '--pg-accent': '#818cf8', '--pg-accent-soft': '#1e2040' }

export default function PlaygroundClient({ fontVarsClass }: { fontVarsClass: string }) {
  const [fontVar, setFontVar] = useState('--pg-inter')
  const [size,    setSize]    = useState(14)
  const [spacing, setSpacing] = useState(0)
  const [lineH,   setLineH]   = useState(1.5)
  const [weight,  setWeight]  = useState(400)
  const [theme,   setTheme]   = useState<'light' | 'dark'>('light')

  const themeVars = theme === 'light' ? LIGHT : DARK
  const fontLabel = FONTS.find(f => f.varName === fontVar)?.label ?? ''

  const previewStyle: React.CSSProperties = {
    fontFamily:    `var(${fontVar})`,
    fontSize:      `${size}px`,
    letterSpacing: `${spacing.toFixed(3)}em`,
    lineHeight:    lineH,
    fontWeight:    weight,
  }

  return (
    <div
      className={fontVarsClass}
      style={{ ...themeVars as React.CSSProperties, position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--pg-bg)', display: 'flex', overflow: 'hidden', color: 'var(--pg-ink1)' }}
    >
      <style>{`
        #pg-root * { box-sizing: border-box; margin: 0; padding: 0; }
        #pg-sb { width: 268px; min-width: 268px; background: var(--pg-surface); border-right: 1px solid var(--pg-border); padding: 20px 16px; display: flex; flex-direction: column; gap: 18px; overflow-y: auto; font-family: ui-sans-serif, system-ui, sans-serif; }
        .cg { display: flex; flex-direction: column; gap: 6px; }
        .cg label { font-size: 11px; font-weight: 600; color: var(--pg-ink3); letter-spacing: .04em; text-transform: uppercase; display: flex; justify-content: space-between; }
        .cg label span { font-weight: 700; color: var(--pg-accent); }
        .cg select { width: 100%; border: 1px solid var(--pg-border); padding: 7px 10px; font-size: 13px; border-radius: 6px; background: var(--pg-bg); color: var(--pg-ink1); appearance: none; cursor: pointer; outline: none; font-family: inherit; }
        .cg input[type=range] { width: 100%; accent-color: var(--pg-accent); cursor: pointer; }
        .div { height: 1px; background: var(--pg-border); flex-shrink: 0; }
        .copybox { background: var(--pg-bg); border: 1px solid var(--pg-border); border-radius: 8px; padding: 10px 12px; font-size: 11px; color: var(--pg-ink2); line-height: 1.6; font-family: monospace !important; white-space: pre; word-break: break-all; }
        #pg-main { flex: 1; padding: 28px 36px; overflow-y: auto; display: flex; flex-direction: column; gap: 28px; }
        .card { background: var(--pg-surface); border: 1px solid var(--pg-border); border-radius: 12px; padding: 28px 32px; display: flex; flex-direction: column; gap: 18px; }
        .card-label { font-size: 10px !important; font-weight: 600 !important; letter-spacing: .07em !important; text-transform: uppercase !important; color: var(--pg-ink3) !important; font-family: ui-sans-serif, system-ui, sans-serif !important; }
        .nav { display: flex; align-items: center; gap: 22px; padding: 12px 18px; background: var(--pg-surface); border: 1px solid var(--pg-border); border-radius: 10px; }
        .two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .pc { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--pg-bg); border-radius: 10px; border: 1px solid var(--pg-border); }
        .av { width: 38px; height: 38px; border-radius: 50%; background: var(--pg-accent-soft); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; color: var(--pg-accent); flex-shrink: 0; }
        .badge { display: inline-flex; align-items: center; padding: 2px 7px; border-radius: 99px; font-size: 10px; font-weight: 600; background: var(--pg-accent-soft); color: var(--pg-accent); }
        .tbl { width: 100%; border-collapse: collapse; }
        .tbl th { font-size: 10px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--pg-ink3); padding: 8px 10px; border-bottom: 1px solid var(--pg-border); text-align: left; }
        .tbl td { font-size: 12px; padding: 9px 10px; color: var(--pg-ink2); border-bottom: 1px solid var(--pg-border); }
        .tbl tr:last-child td { border-bottom: none; }
        .btn { display: inline-flex; align-items: center; padding: 7px 14px; border-radius: 7px; border: none; cursor: pointer; font-size: 12px; font-weight: 600; font-family: inherit; }
      `}</style>

      {/* SIDEBAR */}
      <aside id="pg-sb">
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--pg-ink3)' }}>Font Playground</div>

        <div className="cg">
          <label>Font family</label>
          <select value={fontVar} onChange={e => setFontVar(e.target.value)}>
            {FONTS.map(f => <option key={f.varName} value={f.varName}>{f.label}</option>)}
          </select>
        </div>
        <div className="cg">
          <label>Base size <span>{size}px</span></label>
          <input type="range" min={12} max={20} step={0.5} value={size} onChange={e => setSize(+e.target.value)} />
        </div>
        <div className="cg">
          <label>Letter spacing <span>{spacing.toFixed(3)}em</span></label>
          <input type="range" min={-0.04} max={0.1} step={0.005} value={spacing} onChange={e => setSpacing(+e.target.value)} />
        </div>
        <div className="cg">
          <label>Line height <span>{lineH.toFixed(2)}</span></label>
          <input type="range" min={1} max={2} step={0.05} value={lineH} onChange={e => setLineH(+e.target.value)} />
        </div>
        <div className="cg">
          <label>Font weight <span>{weight}</span></label>
          <input type="range" min={300} max={800} step={100} value={weight} onChange={e => setWeight(+e.target.value)} />
        </div>
        <div className="div" />
        <div className="cg">
          <label>Theme</label>
          <select value={theme} onChange={e => setTheme(e.target.value as 'light' | 'dark')}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div className="div" />
        <div className="cg">
          <label>Current values</label>
          <div className="copybox">{`Font: ${fontLabel}\nSize: ${size}px\nTracking: ${spacing.toFixed(3)}em\nLine-height: ${lineH.toFixed(2)}\nWeight: ${weight}`}</div>
        </div>
      </aside>

      {/* PREVIEW */}
      <div id="pg-main" style={previewStyle}>
        <div className="card">
          <div className="card-label">Navigazione</div>
          <div className="nav">
            <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-.02em', color: 'var(--pg-accent)' }}>CONTRO<span style={{ color: 'var(--pg-ink1)' }}>FANTA</span></span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--pg-ink1)' }}>Classifica</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--pg-ink2)' }}>Rosa</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--pg-ink2)' }}>Listone</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--pg-ink2)' }}>Risultati</span>
          </div>
        </div>

        <div className="card">
          <div className="card-label">Scala tipografica</div>
          <div style={{ fontSize: '2.2em', fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.1, color: 'var(--pg-ink1)' }}>Mondiale 2026 — Gruppo A</div>
          <div style={{ fontSize: '1.5em', fontWeight: 600, color: 'var(--pg-ink1)' }}>Classifica Generale</div>
          <div style={{ fontSize: '1.05em', fontWeight: 500, color: 'var(--pg-ink2)' }}>Risultati del weekend · Giornata 3</div>
          <div style={{ fontSize: '1em', color: 'var(--pg-ink2)', maxWidth: 540 }}>Ogni settimana puoi acquistare giocatori dal listone al prezzo di mercato. La penalità di ownership e il bonus MVP sono i meccanismi strategici chiave della lega.</div>
          <div style={{ fontSize: '.78em', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--pg-ink3)' }}>Portieri · Difensori · Centrocampisti · Attaccanti</div>
        </div>

        <div className="card">
          <div className="card-label">Schede giocatori</div>
          <div className="two">
            {([['MB','Mbappé','Francia · ATT','8.4',true],['VK','Vinicius Jr.','Brasile · ATT','7.1'],['EB','Bellingham','Inghilterra · CEN','6.8'],['AP','Pedri','Spagna · CEN','7.5']] as [string,string,string,string,boolean?][]).map(([i,n,s,sc,mvp]) => (
              <div key={i} className="pc">
                <div className="av">{i}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--pg-ink1)' }}>{n}</div>
                  <div style={{ fontSize: 11, color: 'var(--pg-ink3)', marginTop: 2 }}>{s}{mvp && <> · <span className="badge">MVP</span></>}</div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--pg-accent)', fontVariantNumeric: 'tabular-nums' }}>{sc}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-label">Classifica lega</div>
          <table className="tbl">
            <thead><tr><th>#</th><th>Manager</th><th>Squadra</th><th>Punti</th><th>Crediti</th></tr></thead>
            <tbody>
              {[['1','Ruben','Los Galacticos','142.3','38'],['2','Marco','FC Tattico','138.7','22'],['3','Sofia','Diavoli Rossi','131.0','61'],['4','Luca','Aquile Azzurre','128.5','14']].map(r => (
                <tr key={r[0]}><td style={{ color: 'var(--pg-ink1)', fontWeight: 500 }}>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td style={{ color: 'var(--pg-ink1)', fontWeight: 500 }}>{r[3]}</td><td style={{ color: 'var(--pg-ink1)', fontWeight: 500 }}>{r[4]}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-label">UI Controls</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn" style={{ background: 'var(--pg-accent)', color: '#fff' }}>Acquista giocatore</button>
            <button className="btn" style={{ background: 'transparent', border: '1px solid var(--pg-border)', color: 'var(--pg-ink2)' }}>Vedi rosa</button>
            <button className="btn" style={{ background: 'transparent', border: '1px solid var(--pg-border)', color: 'var(--pg-ink2)' }}>Modifica formazione</button>
            <span className="badge">Mondiale 2026</span>
            <span className="badge" style={{ background: '#fef9c3', color: '#854d0e' }}>In campo</span>
          </div>
        </div>
      </div>
    </div>
  )
}

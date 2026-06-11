'use client'

import { useState, useTransition } from 'react'
import { previewPricesUploadAction, applyPricesUploadAction } from './actions'
import type { PriceUploadResult } from './actions'

interface Props {
  matchdayId: string
}

export function PricesUpload({ matchdayId }: Props) {
  const [csvText, setCsvText] = useState('')
  const [preview, setPreview] = useState<PriceUploadResult | null>(null)
  const [result, setResult]   = useState<PriceUploadResult | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [showUnmatched, setShowUnmatched] = useState(false)

  async function handleFile(file: File) {
    const text = await file.text()
    setCsvText(text)
    setPreview(null)
    setResult(null)
    setError(null)
  }

  function handlePreview() {
    setError(null); setResult(null)
    startTransition(async () => {
      const res = await previewPricesUploadAction(matchdayId, csvText)
      if (res.error) { setError(res.error); setPreview(null); return }
      setPreview(res)
    })
  }

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      const res = await applyPricesUploadAction(matchdayId, csvText)
      if (res.error) { setError(res.error); return }
      setResult(res)
      setPreview(null)
      setCsvText('')
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        <label htmlFor="prices-csv-file" className="text-xs font-medium uppercase tracking-wider text-ink-4">
          File CSV
        </label>
        <input
          id="prices-csv-file"
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }}
          className="block w-full text-sm text-ink-3 file:mr-3 file:rounded-lg file:border file:border-hairline file:bg-glass-1 file:px-3 file:py-1.5 file:text-sm file:text-ink-1 hover:file:bg-glass-2"
        />
        <p className="text-[11px] text-ink-4">
          Formato per riga: <span className="font-mono">nome,squadra,prezzo</span> — separatore <span className="font-mono">,</span> <span className="font-mono">;</span> o tab.
          L&apos;header (se presente) viene saltato automaticamente.
        </p>
      </div>

      {csvText && (
        <details className="rounded-lg border border-hairline bg-transparent p-3">
          <summary className="cursor-pointer text-xs text-ink-3">Anteprima CSV ({csvText.split('\n').length} righe)</summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] font-mono text-ink-3">{csvText.slice(0, 2000)}{csvText.length > 2000 ? '\n…' : ''}</pre>
        </details>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">{error}</div>
      )}

      {preview && !result && (
        <div className="space-y-3 rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-4">
          <p className="text-sm font-semibold text-indigo-300">Anteprima caricamento</p>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-ink-4">Righe lette</p>
              <p className="mt-0.5 font-mono text-lg text-ink-1">{preview.parsed_count}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-ink-4">Abbinate</p>
              <p className="mt-0.5 font-mono text-lg text-emerald-400">{preview.matched}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-ink-4">Non abbinate</p>
              <p className={`mt-0.5 font-mono text-lg ${preview.unmatched > 0 ? 'text-amber-400' : 'text-ink-4'}`}>{preview.unmatched}</p>
            </div>
          </div>

          {preview.unmatched > 0 && preview.unmatched_rows && preview.unmatched_rows.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowUnmatched((v) => !v)}
                className="text-xs text-amber-700 dark:text-amber-300 hover:text-amber-700 dark:text-amber-200"
              >
                {showUnmatched ? '▾ Nascondi' : '▸ Mostra'} righe non abbinate
              </button>
              {showUnmatched && (
                <div className="mt-2 max-h-64 overflow-auto rounded border border-hairline bg-transparent">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-hairline text-left text-ink-4">
                        <th className="px-2 py-1">Riga</th>
                        <th className="px-2 py-1">Nome</th>
                        <th className="px-2 py-1">Squadra</th>
                        <th className="px-2 py-1">Prezzo</th>
                        <th className="px-2 py-1">Motivo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {preview.unmatched_rows.map((r, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1 text-ink-4">{r.line}</td>
                          <td className="px-2 py-1 text-ink-2">{r.full_name}</td>
                          <td className="px-2 py-1 text-ink-3">{r.club}</td>
                          <td className="px-2 py-1 font-mono text-ink-3">{r.price}</td>
                          <td className="px-2 py-1 text-amber-700 dark:text-amber-300">
                            {r.reason === 'no-match' ? 'nessun abbinamento' : 'ambiguo (più candidati)'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending || preview.matched === 0}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
            >
              {isPending ? 'Salvataggio…' : `Conferma e salva ${preview.matched} prezzi`}
            </button>
            <button
              type="button"
              onClick={() => { setPreview(null); setShowUnmatched(false) }}
              className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-3 hover:text-ink-1"
            >
              Annulla
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-1.5 text-sm">
          <p className="font-semibold text-emerald-300">✓ Prezzi salvati</p>
          <p className="text-ink-2">
            <span className="font-mono">{result.matched}</span> abbinati
            {' — '}
            <span className="font-mono text-emerald-400">{result.inserted}</span> nuovi
            {', '}
            <span className="font-mono text-indigo-300">{result.updated}</span> aggiornati
            {', '}
            <span className="font-mono text-ink-4">{result.matched - result.inserted - result.updated}</span> invariati
            {result.unmatched > 0 && (
              <>{' — '}<span className="font-mono text-amber-400">{result.unmatched}</span> non abbinati</>
            )}
            .
          </p>
        </div>
      )}

      {!preview && !result && csvText && (
        <button
          type="button"
          onClick={handlePreview}
          disabled={isPending}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
        >
          {isPending ? 'Verifica…' : 'Anteprima abbinamenti'}
        </button>
      )}
    </div>
  )
}

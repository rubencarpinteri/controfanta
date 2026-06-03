'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { usePathname } from 'next/navigation'

const TABS = [
  { label: 'Overview',    suffix: '' },
  { label: 'Mia Rosa',    suffix: '/rosa' },
  { label: 'Formazione',  suffix: '/formazione' },
  { label: 'Rose Nazionali', suffix: '/nazionali' },
  { label: 'Risultati',   suffix: '/risultati' },
  { label: 'Classifica',  suffix: '/classifica' },
  { label: 'Regole',      suffix: '/regole' },
]

export function FMUserTabNav({ id }: { id: string }) {
  const pathname = usePathname()
  const base = `/controfantamondiale/${id}`

  return (
    <div className="sticky top-0 z-10 -mx-4 mb-5 bg-surface-0/80 px-4 backdrop-blur-xl md:-mx-8 md:px-8">
      <div className="flex gap-0 overflow-x-auto border-b border-hairline pb-0 pt-3 scrollbar-none">
        {TABS.map((tab) => {
          const href = `${base}${tab.suffix}`
          const isActive =
            tab.suffix === ''
              ? pathname === base
              : pathname.startsWith(href)
          return (
            <Link
              key={tab.suffix}
              href={href as Route}
              className={`relative shrink-0 px-3.5 pb-2.5 pt-1 text-[12px] font-medium transition-colors ${
                isActive ? 'text-indigo-400' : 'text-ink-4 hover:text-ink-2'
              }`}
            >
              {tab.label}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-indigo-500" />
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

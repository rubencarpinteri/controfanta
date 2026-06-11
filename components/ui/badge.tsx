type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'accent'
  | 'muted'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'border border-hairline bg-glass-2 text-ink-2',
  success: 'border border-emerald-400/25 bg-emerald-500/10 text-emerald-300',
  warning: 'border border-amber-400/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  danger:  'border border-rose-400/25 bg-rose-500/10 text-rose-300',
  info:    'border border-sky-400/25 bg-sky-500/10 text-sky-300',
  accent:  'border border-indigo-400/25 bg-indigo-500/10 text-indigo-300',
  muted:   'border border-transparent bg-glass-1 text-ink-4',
}

export function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium',
        variantClasses[variant],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  )
}

// Convenience: matchday status → badge variant
export function MatchdayStatusBadge({ status }: { status: string }) {
  const map: Record<string, BadgeVariant> = {
    draft: 'muted',
    open: 'info',
    closed: 'success',
    archived: 'muted',
    // Legacy statuses
    locked: 'warning',
    scoring: 'accent',
    published: 'success',
  }
  const labels: Record<string, string> = {
    draft: 'In Programma',
    open: 'Aperta',
    closed: 'Chiusa',
    archived: 'Archiviata',
    // Legacy statuses
    locked: 'Chiusa (legacy)',
    scoring: 'In calcolo (legacy)',
    published: 'Pubblicata (legacy)',
  }
  return (
    <Badge variant={map[status] ?? 'muted'}>
      {labels[status] ?? status}
    </Badge>
  )
}

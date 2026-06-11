type AlertVariant = 'error' | 'success' | 'warning' | 'info'

interface AlertProps {
  variant?: AlertVariant
  title?: string
  children: React.ReactNode
  className?: string
}

const styles: Record<AlertVariant, string> = {
  error:   'border-rose-400/25 bg-rose-500/8 text-rose-200',
  success: 'border-emerald-400/25 bg-emerald-500/8 text-emerald-200',
  warning: 'border-amber-400/25 bg-amber-500/8 text-amber-700 dark:text-amber-200',
  info:    'border-sky-400/25 bg-sky-500/8 text-sky-200',
}

const titleColor: Record<AlertVariant, string> = {
  error:   'text-rose-300',
  success: 'text-emerald-300',
  warning: 'text-amber-700 dark:text-amber-300',
  info:    'text-sky-300',
}

export function Alert({ variant = 'info', title, children, className = '' }: AlertProps) {
  return (
    <div
      role="alert"
      className={[
        'rounded-2xl border px-4 py-3 text-[13px] backdrop-blur-xl',
        styles[variant],
        className,
      ].join(' ')}
    >
      {title && <p className={['mb-1 text-[13px] font-semibold tracking-tight', titleColor[variant]].join(' ')}>{title}</p>}
      <div className="text-[12.5px] leading-[1.55] opacity-95">{children}</div>
    </div>
  )
}

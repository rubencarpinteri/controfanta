import Image from 'next/image'

type TeamCrestProps = {
  name: string
  /** SportMonks team crest (preferred). */
  logoUrl?: string | null
  /** Country flag image (fallback when no crest). */
  flagUrl?: string | null
  /** FIFA code, used as last-resort text chip when no image exists. */
  fifaCode?: string | null
  /** Rendered square size in px. */
  size?: number
  className?: string
}

/**
 * Renders a national team's visual identity. Prefers the SportMonks crest,
 * falls back to the country flag, then to a FIFA-code text chip — so it never
 * renders a broken/empty image (and avoids the inconsistent emoji flags that
 * fail on some platforms, e.g. Scotland).
 */
export function TeamCrest({
  name,
  logoUrl,
  flagUrl,
  fifaCode,
  size = 20,
  className = '',
}: TeamCrestProps) {
  const src = logoUrl || flagUrl
  if (src) {
    return (
      <Image
        src={src}
        alt={name}
        width={size}
        height={size}
        className={`inline-block shrink-0 object-contain ${className}`}
        unoptimized
      />
    )
  }
  return (
    <span
      aria-label={name}
      className={`inline-flex shrink-0 items-center justify-center rounded bg-glass-2 font-mono text-ink-4 ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {(fifaCode ?? name.slice(0, 3)).toUpperCase()}
    </span>
  )
}

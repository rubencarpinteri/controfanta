import type { Metadata, Viewport } from 'next'
import {
  Inter,
  Space_Grotesk,
  Space_Mono,
  Mozilla_Headline,
  JetBrains_Mono,
} from 'next/font/google'
import localFont from 'next/font/local'
import './globals.css'

// ── Font slots ───────────────────────────────────────────────────────────────
// All seven faces are loaded here and exposed as CSS variables. Which face fills
// each *semantic slot* (--cf-font-heading / -body / -accent / -mono) is decided
// in globals.css and can be overridden at runtime by the admin Font Switcher
// (persisted to localStorage, applied pre-paint by the boot script below).
//
// 5 faces come from next/font/google; Stack Sans Headline/Notch are too new to
// be in Next's baked font manifest, so they are self-hosted via next/font/local.
// Only the four default-combo faces preload; the alternates load on demand.

const inter = Inter({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-inter',
  display: 'swap',
})

const mozillaHeadline = Mozilla_Headline({
  subsets: ['latin'],
  variable: '--font-mozilla-headline',
  display: 'swap',
  // Too new for Next's capsize metrics table, so no size-adjusted fallback can
  // be generated — disable the attempt to avoid a build-time warning.
  adjustFontFallback: false,
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
  preload: false,
})

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-space-mono',
  display: 'swap',
  preload: false,
})

const stackSansHeadline = localFont({
  src: './fonts/StackSansHeadline.woff2',
  weight: '300 700',
  variable: '--font-stack-sans-headline',
  display: 'swap',
})

const stackSansNotch = localFont({
  src: './fonts/StackSansNotch.woff2',
  weight: '300 700',
  variable: '--font-stack-sans-notch',
  display: 'swap',
  preload: false,
})

const fontVars = [
  inter.variable,
  mozillaHeadline.variable,
  jetbrainsMono.variable,
  spaceGrotesk.variable,
  spaceMono.variable,
  stackSansHeadline.variable,
  stackSansNotch.variable,
].join(' ')

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title: {
    default: 'CONTROFANTA',
    template: '%s — CONTROFANTA',
  },
  description: 'Private Mantra-style fantasy football league with statistics-based scoring.',
}

// Inline boot script — runs before paint to honor saved theme without FOUC.
// Light is the default; only flips to dark when the user has explicitly chosen it.
const themeBootScript = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`

// Inline boot script — applies the admin's saved font combination before paint,
// so a custom slot mapping never flashes the defaults. Shape of `cf-fonts`:
//   { heading, body, accent, mono: <font-key>, accentItalic: boolean }
// Keep the key→var and slot→var maps in sync with components/admin/FontSwitcher.
const fontBootScript = `(function(){try{var raw=localStorage.getItem('cf-fonts');if(!raw)return;var f=JSON.parse(raw);var V={'inter':'--font-inter','space-grotesk':'--font-space-grotesk','space-mono':'--font-space-mono','mozilla-headline':'--font-mozilla-headline','stack-sans-headline':'--font-stack-sans-headline','stack-sans-notch':'--font-stack-sans-notch','jetbrains-mono':'--font-jetbrains-mono'};var S={'heading':'--cf-font-heading','body':'--cf-font-body','accent':'--cf-font-accent','mono':'--cf-font-mono'};var d=document.documentElement.style;Object.keys(S).forEach(function(k){if(f[k]&&V[f[k]])d.setProperty(S[k],'var('+V[f[k]]+')');});if(typeof f.accentItalic!=='undefined')d.setProperty('--cf-accent-style',f.accentItalic?'italic':'normal');}catch(e){}})();`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="it" className={fontVars} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <script dangerouslySetInnerHTML={{ __html: fontBootScript }} />
      </head>
      <body>
        <div className="ambient" aria-hidden="true">
          <div className="blob b3" />
          <div className="blob b4" />
          <div className="grain" />
        </div>
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  )
}

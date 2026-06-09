import type { Metadata, Viewport } from 'next'
import { Space_Grotesk, Space_Mono } from 'next/font/google'
import localFont from 'next/font/local'
import './globals.css'

// ── Font slots ───────────────────────────────────────────────────────────────
// The four faces that fill the semantic slots (--cf-font-heading / -body /
// -accent / -mono, mapped in globals.css). Space Grotesk and Space Mono come
// from next/font/google; Stack Sans Headline/Notch are too new for Next's baked
// font manifest, so they are self-hosted via next/font/local.

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-space-mono',
  display: 'swap',
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
})

const fontVars = [
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="it" className={fontVars} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
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

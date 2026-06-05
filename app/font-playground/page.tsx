import {
  Anton, Oswald, JetBrains_Mono, IBM_Plex_Sans, Libre_Baskerville, Inter, Karla,
  Source_Sans_3, Lora, Ultra, Bevan, Albert_Sans, Bricolage_Grotesque, DM_Sans,
  Fraunces, Hanken_Grotesk, Manrope, Righteous, Space_Grotesk, Space_Mono,
} from 'next/font/google'
import PlaygroundClient from './PlaygroundClient'

const anton            = Anton            ({ subsets: ['latin'], weight: '400',                                  variable: '--pg-anton' })
const oswald           = Oswald           ({ subsets: ['latin'], weight: ['300','400','500','600','700'],         variable: '--pg-oswald' })
const jetbrainsMono    = JetBrains_Mono   ({ subsets: ['latin'], weight: ['300','400','500','600','700'],         variable: '--pg-jetbrains' })
const ibmPlexSans      = IBM_Plex_Sans    ({ subsets: ['latin'], weight: ['300','400','500','600','700'],         variable: '--pg-ibmplex' })
const libreBaskerville = Libre_Baskerville({ subsets: ['latin'], weight: ['400','700'],                          variable: '--pg-libre' })
const inter            = Inter            ({ subsets: ['latin'], weight: ['300','400','500','600','700'],         variable: '--pg-inter' })
const karla            = Karla            ({ subsets: ['latin'], weight: ['300','400','500','600','700'],         variable: '--pg-karla' })
const sourceSans3      = Source_Sans_3    ({ subsets: ['latin'], weight: ['300','400','500','600','700'],         variable: '--pg-source' })
const lora             = Lora             ({ subsets: ['latin'], weight: ['400','500','600','700'],               variable: '--pg-lora' })
const ultra            = Ultra            ({ subsets: ['latin'], weight: '400',                                  variable: '--pg-ultra' })
const bevan            = Bevan            ({ subsets: ['latin'], weight: '400',                                  variable: '--pg-bevan' })
const albertSans       = Albert_Sans      ({ subsets: ['latin'], weight: ['300','400','500','600','700'],         variable: '--pg-albert' })
const bricolage        = Bricolage_Grotesque({ subsets: ['latin'], weight: ['300','400','500','600','700','800'], variable: '--pg-bricolage' })
const dmSans           = DM_Sans          ({ subsets: ['latin'], weight: ['300','400','500','600','700'],         variable: '--pg-dmsans' })
const fraunces         = Fraunces         ({ subsets: ['latin'], weight: ['400','500','600','700'],               variable: '--pg-fraunces' })
const hankenGrotesk    = Hanken_Grotesk   ({ subsets: ['latin'], weight: ['300','400','500','600','700'],         variable: '--pg-hanken' })
const manrope          = Manrope          ({ subsets: ['latin'], weight: ['300','400','500','600','700'],         variable: '--pg-manrope' })
const righteous        = Righteous        ({ subsets: ['latin'], weight: '400',                                  variable: '--pg-righteous' })
const spaceGrotesk     = Space_Grotesk    ({ subsets: ['latin'], weight: ['300','400','500','600','700'],         variable: '--pg-spacegrotesk' })
const spaceMono        = Space_Mono       ({ subsets: ['latin'], weight: ['400','700'],                          variable: '--pg-spacemono' })

const fontVarsClass = [
  anton, oswald, jetbrainsMono, ibmPlexSans, libreBaskerville, inter, karla,
  sourceSans3, lora, ultra, bevan, albertSans, bricolage, dmSans, fraunces,
  hankenGrotesk, manrope, righteous, spaceGrotesk, spaceMono,
].map(f => f.variable).join(' ')

export default function FontPlaygroundPage() {
  return <PlaygroundClient fontVarsClass={fontVarsClass} />
}

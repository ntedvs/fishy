import { Metadata } from "next"
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google"

import Navbar from "~/components/navbar"
import "~/globals.css"

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-plex-sans",
})

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-plex-mono",
})

export const metadata: Metadata = {
  title: "Fishy • Financial risk review",
  description: "Find suspicious financial records with confidence-aware analysis.",
  icons: { icon: "/cute-fish.svg" },
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html className={`${sans.variable} ${mono.variable} bg-canvas`} lang="en">
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased">
        <Navbar />
        {children}
      </body>
    </html>
  )
}

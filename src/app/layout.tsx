import type { Metadata } from "next"
import type { ReactNode } from "react"
import { SiteHeader } from "@/components/site-header"

import "./globals.css"

export const metadata: Metadata = {
  title: "voteGPT | Civic information grounded in sources",
  description:
    "voteGPT is building sourced civic information for everyday U.S. voters.",
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <SiteHeader />
        {children}
      </body>
    </html>
  )
}

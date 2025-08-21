import type React from "react"
import { Inter } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { AppStateProvider } from "@/lib/contexts/app-state-context"

const inter = Inter({ subsets: ["latin"] })

export const metadata = {
  title: "imgtoss - 图像上传管理工具",
  description: "自动化上传图像至对象存储的跨平台应用",
    generator: 'v0.app'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AppStateProvider>
            {children}
          </AppStateProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

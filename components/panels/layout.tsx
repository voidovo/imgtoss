"use client"

import type { ReactNode } from "react"
import { memo } from "react"
import Sidebar from "./sidebar"
import TopNav from "./top-nav"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

interface LayoutProps {
  children: ReactNode
}

function Layout({ children }: LayoutProps) {
  const { theme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // 优化渲染逻辑：直接使用 resolvedTheme 或提供 fallback
  const isDark = mounted ? resolvedTheme === 'dark' : false

  return (
    <div className={`flex h-screen ${isDark ? "dark" : ""}`}>
      <Sidebar />
      <div className="w-full flex flex-1 flex-col">
        <header className="h-16 border-b border-gray-200 dark:border-[#1F1F23]">
          <TopNav />
        </header>
        <main className="flex-1 overflow-auto p-6 bg-white dark:bg-[#0F0F12]">
          {children}
        </main>
      </div>
    </div>
  )
}

// 使用 React.memo 优化性能
export default memo(Layout)

export { Layout }

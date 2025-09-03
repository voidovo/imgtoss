"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function SettingsPage() {
  const router = useRouter()

  useEffect(() => {
    // 默认重定向到更新页面
    router.replace("/settings/about")
  }, [router])

  return null
}
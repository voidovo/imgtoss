"use client"

import React from "react"
import SettingsSidebar from "@/components/panels/settings-sidebar"

interface SettingsLayoutProps {
  children: React.ReactNode
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  return (
    <div className="flex h-full min-h-screen">
      {/* 左侧边栏 */}
      <div className="px-2 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F0F12]">
        <SettingsSidebar />
      </div>

      {/* 右侧内容 */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">设置</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              管理应用程序的配置和偏好设置
            </p>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
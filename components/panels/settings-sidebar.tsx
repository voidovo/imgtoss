"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Settings, Download, Info, Palette, Shield, Bell } from "lucide-react"

// 设置分类接口定义
interface SettingCategory {
  id: string
  name: string
  icon: React.ComponentType<{ className?: string }>
  href: string
}

// 默认设置分类
const defaultCategories: SettingCategory[] = [
  {
    id: "update",
    name: "应用更新",
    icon: Download,
    href: "/settings/update",
  },
  {
    id: "about",
    name: "关于应用",
    icon: Info,
    href: "/settings/about",
  },
]

export default function SettingsSidebar() {
  const pathname = usePathname()
  
  return (
    <div className="w-full h-full bg-white dark:bg-gray-800">
      <div className="p-4">
        <nav className="space-y-2">
          {defaultCategories.map((category) => {
            const isActive = pathname === category.href
            const Icon = category.icon

            return (
              <Link
                key={category.id}
                href={category.href}
                className={`w-full flex items-center px-4 py-2 text-sm rounded-md transition-colors ${
                  isActive
                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                    : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                <Icon className="h-4 w-4 mr-3 flex-shrink-0" />
                {category.name}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}

// 导出类型定义供其他组件使用
export type { SettingCategory }
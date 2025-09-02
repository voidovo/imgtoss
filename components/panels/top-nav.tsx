"use client"

import { Bell } from "lucide-react"
import { ThemeToggle } from "../theme-toggle"

export default function TopNav() {
  return (
    <nav className="px-3 sm:px-6 flex items-center justify-end bg-white dark:bg-[#0F0F12] border-b border-gray-200 dark:border-[#1F1F23] h-full">
      <div className="flex items-center gap-2 sm:gap-4">
        <button
          type="button"
          className="p-1.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-[#1F1F23] rounded-full transition-colors"
        >
          <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-gray-600 dark:text-gray-300" />
        </button>

        <ThemeToggle />
      </div>
    </nav>
  )
}

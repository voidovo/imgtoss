import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
  }),
  usePathname: () => '/settings/update',
}))

// Mock the updater API
vi.mock('@/lib/updater-api', () => ({
  updaterAPI: {
    checkForUpdates: vi.fn(),
    downloadAndInstall: vi.fn(),
    relaunchApp: vi.fn(),
    onProgress: vi.fn(() => () => {}),
  },
  UpdateStage: {
    Idle: 'idle',
    Checking: 'checking',
    Downloading: 'downloading',
    Installing: 'installing',
    Completed: 'completed',
    Error: 'error',
  },
}))

// Mock the Layout component
vi.mock('@/components/panels/layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>,
}))

import UpdateSettingsPage from '@/app/settings/update/page'
import GeneralSettingsPage from '@/app/settings/general/page'
import SettingsSidebar from '@/components/panels/settings-sidebar'

describe('Settings Routes', () => {
  it('应该渲染更新设置页面', () => {
    render(<UpdateSettingsPage />)
    
    // 检查更新面板是否渲染
    expect(screen.getByText('应用更新')).toBeDefined()
  })

  it('应该渲染通用设置页面', () => {
    render(<GeneralSettingsPage />)
    
    // 检查通用设置页面是否渲染
    expect(screen.getByText('通用设置')).toBeDefined()
    expect(screen.getByText('配置应用程序的基本设置和行为')).toBeDefined()
  })

  it('设置侧边栏应该包含所有导航链接', () => {
    render(<SettingsSidebar />)
    
    // 检查所有设置分类是否存在
    expect(screen.getByText('应用更新')).toBeDefined()
    expect(screen.getByText('通用设置')).toBeDefined()
    expect(screen.getByText('外观设置')).toBeDefined()
    expect(screen.getByText('隐私安全')).toBeDefined()
    expect(screen.getByText('通知设置')).toBeDefined()
    expect(screen.getByText('关于应用')).toBeDefined()
  })
})
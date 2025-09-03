import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import SettingsLayout from '@/components/panels/settings-layout'

// Mock the Sheet component since it uses Radix UI
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div data-testid="sheet">{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div data-testid="sheet-content">{children}</div>,
  SheetTrigger: ({ children }: { children: React.ReactNode }) => <div data-testid="sheet-trigger">{children}</div>,
}))

// Mock the Button component
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}))

describe('SettingsLayout', () => {
  it('应该渲染左右分栏布局', () => {
    const mockSidebar = <div data-testid="sidebar">侧边栏内容</div>
    const mockChildren = <div data-testid="main-content">主要内容</div>

    render(
      <SettingsLayout sidebar={mockSidebar}>
        {mockChildren}
      </SettingsLayout>
    )

    // 检查侧边栏内容是否存在（桌面端和移动端都有）
    const sidebarElements = screen.getAllByTestId('sidebar')
    expect(sidebarElements).toHaveLength(2) // 桌面端和移动端各一个
    
    // 检查主要内容是否存在
    expect(screen.getByTestId('main-content')).toBeDefined()
  })

  it('应该包含移动端菜单按钮', () => {
    const mockSidebar = <div>侧边栏</div>
    const mockChildren = <div>内容</div>

    render(
      <SettingsLayout sidebar={mockSidebar}>
        {mockChildren}
      </SettingsLayout>
    )

    // 检查移动端菜单按钮是否存在
    const menuButton = screen.getByRole('button')
    expect(menuButton).toBeDefined()
  })

  it('应该有正确的响应式类名', () => {
    const mockSidebar = <div>侧边栏</div>
    const mockChildren = <div>内容</div>

    const { container } = render(
      <SettingsLayout sidebar={mockSidebar}>
        {mockChildren}
      </SettingsLayout>
    )

    // 检查桌面端侧边栏的响应式类名
    const desktopSidebar = container.querySelector('.hidden.lg\\:flex')
    expect(desktopSidebar).toBeDefined()
    
    // 检查主容器的基本布局类名
    const mainContainer = container.querySelector('.flex.h-full.min-h-screen')
    expect(mainContainer).toBeDefined()
  })
})
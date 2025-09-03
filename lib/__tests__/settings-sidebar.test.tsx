import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SettingsSidebar from '@/components/panels/settings-sidebar'
import { Settings, Download } from 'lucide-react'

describe('SettingsSidebar', () => {
  const mockOnCategoryChange = vi.fn()

  const testCategories = [
    {
      id: 'update',
      name: '应用更新',
      icon: Download,
    },
    {
      id: 'general',
      name: '通用设置',
      icon: Settings,
    },
  ]

  beforeEach(() => {
    mockOnCategoryChange.mockClear()
  })

  it('应该渲染设置标题', () => {
    render(
      <SettingsSidebar
        categories={testCategories}
        activeCategory="update"
        onCategoryChange={mockOnCategoryChange}
      />
    )

    expect(screen.getByText('设置')).toBeDefined()
  })

  it('应该渲染所有设置分类', () => {
    render(
      <SettingsSidebar
        categories={testCategories}
        activeCategory="update"
        onCategoryChange={mockOnCategoryChange}
      />
    )

    expect(screen.getByText('应用更新')).toBeDefined()
    expect(screen.getByText('通用设置')).toBeDefined()
  })

  it('应该高亮显示当前选中的分类', () => {
    render(
      <SettingsSidebar
        categories={testCategories}
        activeCategory="update"
        onCategoryChange={mockOnCategoryChange}
      />
    )

    const activeButton = screen.getByText('应用更新').closest('button')
    const inactiveButton = screen.getByText('通用设置').closest('button')

    expect(activeButton?.className).toContain('bg-blue-50')
    expect(activeButton?.className).toContain('text-blue-700')
    expect(inactiveButton?.className).toContain('text-gray-600')
  })

  it('点击分类时应该调用 onCategoryChange', () => {
    render(
      <SettingsSidebar
        categories={testCategories}
        activeCategory="update"
        onCategoryChange={mockOnCategoryChange}
      />
    )

    const generalButton = screen.getByText('通用设置')
    fireEvent.click(generalButton)

    expect(mockOnCategoryChange).toHaveBeenCalledWith('general')
  })

  it('应该使用默认分类当没有提供 categories 时', () => {
    render(
      <SettingsSidebar
        activeCategory="update"
        onCategoryChange={mockOnCategoryChange}
      />
    )

    // 检查默认分类是否存在
    expect(screen.getByText('应用更新')).toBeDefined()
    expect(screen.getByText('通用设置')).toBeDefined()
    expect(screen.getByText('外观设置')).toBeDefined()
    expect(screen.getByText('隐私安全')).toBeDefined()
    expect(screen.getByText('通知设置')).toBeDefined()
    expect(screen.getByText('关于应用')).toBeDefined()
  })
})
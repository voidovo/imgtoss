# 设置页面路由结构

## 概述

设置页面已重构为使用 Next.js 的二级路由，提供更好的用户体验和代码组织。

## 路由结构

```
/settings/                  # 默认重定向到 /settings/update
├── update/                 # 应用更新设置
├── general/                # 通用设置
├── appearance/             # 外观设置
├── privacy/                # 隐私安全设置
├── notifications/          # 通知设置
└── about/                  # 关于应用
```

## 文件结构

```
app/settings/
├── layout.tsx              # 设置页面共享布局
├── page.tsx               # 默认页面（重定向到 update）
├── update/
│   └── page.tsx           # 应用更新页面
├── general/
│   └── page.tsx           # 通用设置页面
├── appearance/
│   └── page.tsx           # 外观设置页面
├── privacy/
│   └── page.tsx           # 隐私安全页面
├── notifications/
│   └── page.tsx           # 通知设置页面
└── about/
    └── page.tsx           # 关于应用页面
```

## 优势

1. **清晰的 URL 结构**: 每个设置页面都有独立的 URL
2. **更好的 SEO**: 每个页面可以有独立的元数据
3. **代码分离**: 每个设置页面的逻辑完全独立
4. **浏览器历史**: 用户可以使用浏览器的前进/后退按钮
5. **直接访问**: 用户可以直接访问特定的设置页面
6. **更好的开发体验**: 每个页面都是独立的组件，便于维护

## 导航

设置侧边栏 (`components/panels/settings-sidebar.tsx`) 使用 Next.js 的 `Link` 组件进行导航，并通过 `usePathname` 钩子来高亮当前活动的页面。

## 布局

所有设置页面共享相同的布局 (`app/settings/layout.tsx`)，包括：
- 应用主布局
- 左侧设置导航栏
- 右侧内容区域

## 扩展

要添加新的设置页面：

1. 在 `app/settings/` 下创建新的目录
2. 添加 `page.tsx` 文件
3. 在 `components/panels/settings-sidebar.tsx` 中添加导航项

例如，添加"高级设置"页面：

```bash
mkdir app/settings/advanced
echo 'export default function AdvancedSettingsPage() { return <div>高级设置</div> }' > app/settings/advanced/page.tsx
```

然后在侧边栏中添加导航项。
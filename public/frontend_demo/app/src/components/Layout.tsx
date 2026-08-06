import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { motion } from 'framer-motion';
import { Boxes, Layers, Moon, PanelsTopLeft, Sun } from 'lucide-react';
import Kbd from '@/components/Kbd';
import { Toaster, toast } from '@/components/Toast';
import { useSelectionStore, selectedCount } from '@/lib/store';

const TABS = [
  { to: '/workspace', label: '工作台' },
  { to: '/library', label: '会话库' },
] as const;

const PAGE_NAMES: Record<string, string> = {
  '/workspace': '工作台',
  '/library': '会话库',
};

const THEME_KEY = 'sessiongrid-theme';

/** 主题切换：读写 <html> .dark，持久化到 localStorage，默认暗色 */
function useTheme() {
  const [dark, setDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
    } catch {
      /* 忽略持久化失败 */
    }
  }, [dark]);
  return { dark, toggle: () => setDark((v) => !v) };
}

/**
 * Layout — App 页外壳 (design.md §8.2)
 * 固定 52px TopBar：Logo + 面包屑、页签（framer-motion layoutId 下划线）、
 * ⌘K 按钮、摘选托盘按钮（lime 计数徽标）、头像圆点；内容区 <Outlet/> + 52px 顶部留白。
 */
export default function Layout() {
  const location = useLocation();
  const selected = useSelectionStore((s) => s.selected);
  const count = selectedCount(selected);
  const pageName = PAGE_NAMES[location.pathname] ?? '工作台';
  const { dark, toggle } = useTheme();

  return (
    <div className="min-h-[100dvh] bg-canvas text-text-primary">
      <header className="fixed top-0 left-0 right-0 z-50 flex h-[52px] items-center gap-4 border-b border-border-subtle bg-canvas px-4">
        {/* 左：Logo + 面包屑 */}
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <img src="/logo.svg" alt="SessionGrid" className="h-6 w-6" />
            <span className="font-display font-bold text-[15px] tracking-tight">SessionGrid</span>
          </Link>
          <span className="hidden sm:flex items-center gap-1.5 text-[12px] text-text-muted">
            <span>/</span>
            <span className="text-text-secondary">{pageName}</span>
          </span>
        </div>

        {/* 中：页签导航（layoutId 滑动下划线） */}
        <nav className="flex h-full items-stretch gap-1 mx-auto">
          {TABS.map((tab) => {
            const active = location.pathname === tab.to;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                className="relative flex items-center px-3 text-[13px] font-medium transition-colors duration-150"
              >
                <span className={active ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'}>
                  {tab.label}
                </span>
                {active && (
                  <motion.span
                    layoutId="topbar-tab-underline"
                    className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-lime"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* 右：⌘K、摘选托盘、头像 */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            className="hidden md:flex items-center gap-2 rounded-btn border border-border-subtle bg-panel px-2.5 h-8 text-[12px] text-text-muted transition-colors hover:border-border-strong hover:text-text-secondary"
          >
            <span>命令面板</span>
            <span className="flex items-center gap-0.5">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
          <button
            type="button"
            title="摘选托盘"
            className="relative flex h-8 w-8 items-center justify-center rounded-btn border border-border-subtle bg-panel text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
          >
            <Layers className="h-4 w-4" />
            {count > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-lime px-1 font-mono text-[10px] font-bold text-canvas">
                {count}
              </span>
            )}
          </button>
          {/* 预留面板入口（占位，toast 提示） */}
          <button
            type="button"
            title="面板 A · 预留"
            onClick={() => toast('面板入口预留，即将上线')}
            className="flex h-8 w-8 items-center justify-center rounded-btn text-text-muted transition-colors hover:bg-panel hover:text-text-secondary"
          >
            <PanelsTopLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="面板 B · 预留"
            onClick={() => toast('面板入口预留，即将上线')}
            className="flex h-8 w-8 items-center justify-center rounded-btn text-text-muted transition-colors hover:bg-panel hover:text-text-secondary"
          >
            <Boxes className="h-4 w-4" />
          </button>
          {/* 浅色/暗色切换 */}
          <button
            type="button"
            title={dark ? '切换到浅色模式' : '切换到暗色模式'}
            onClick={toggle}
            className="flex h-8 w-8 items-center justify-center rounded-btn border border-border-subtle bg-panel text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <span className="h-7 w-7 rounded-full border border-border-strong bg-gradient-to-br from-raised to-panel" title="本地演示用户" />
        </div>
      </header>

      {/* 内容插槽：TopBar 高 52px */}
      <main className="pt-[52px]">
        <Outlet />
      </main>

      <Toaster />
    </div>
  );
}

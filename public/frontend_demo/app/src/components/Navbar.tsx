import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Github, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

const ANCHORS = [
  { href: '#features', label: '功能' },
  { href: '#agents', label: '支持的 Agent' },
  { href: '#workflow', label: '工作流程' },
  { href: '#shortcuts', label: '快捷键' },
];

/**
 * Navbar — 落地页专用 (design.md §8.1)
 * 56px fixed，滚动 >24px 后 bg-canvas/80 + blur + 底部描边。
 */
export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      className={cn(
        'fixed top-0 left-0 right-0 z-50 h-14 transition-all duration-200',
        scrolled ? 'bg-canvas/80 backdrop-blur-[12px] border-b border-border-subtle' : 'border-b border-transparent',
      )}
    >
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <img src="/logo.svg" alt="SessionGrid" className="h-7 w-7" />
          <span className="font-display font-bold text-[17px] tracking-tight">SessionGrid</span>
        </Link>

        <div className="hidden md:flex items-center gap-7">
          {ANCHORS.map((a) => (
            <a key={a.href} href={a.href} className="text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary">
              {a.label}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="flex h-9 w-9 items-center justify-center rounded-btn border border-border-subtle text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
          >
            <Github className="h-4 w-4" />
          </a>
          <Link
            to="/workspace"
            className="flex h-9 items-center rounded-btn bg-lime px-4 text-[13px] font-bold text-canvas transition-opacity hover:opacity-90"
          >
            进入工作台 →
          </Link>
        </div>

        <button
          type="button"
          className="md:hidden flex h-9 w-9 items-center justify-center text-text-secondary"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* 移动端全屏抽屉 */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 top-14 z-40 flex flex-col gap-2 bg-canvas px-6 py-8 md:hidden"
          >
            {[...ANCHORS.map((a) => ({ ...a, to: undefined as string | undefined })), { href: undefined, to: '/workspace', label: '进入工作台' }].map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                {item.to ? (
                  <Link to={item.to} onClick={() => setOpen(false)} className="block py-3 text-h3 text-lime">
                    {item.label}
                  </Link>
                ) : (
                  <a href={item.href} onClick={() => setOpen(false)} className="block py-3 text-h3 text-text-primary">
                    {item.label}
                  </a>
                )}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

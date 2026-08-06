import { create } from 'zustand';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';

/**
 * Toast — (design.md §8.8)
 * 右上滑入（x 40→0 + fade, 250ms spring），bg-raised + lime 左条，3s 自动消失。
 * 用法：任意处调用 `toast('已复制 6 个片段', '4,218 tokens')`，渲染一次 `<Toaster/>`（Layout 已挂载）。
 */

interface ToastItem {
  id: number;
  message: string;
  sub?: string;
}

interface ToastState {
  toasts: ToastItem[];
  push: (message: string, sub?: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (message, sub) => {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts, { id, message, sub }] }));
    setTimeout(() => {
      useToastStore.getState().dismiss(id);
    }, 3000);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/** 全局 toast 触发器 */
export function toast(message: string, sub?: string) {
  useToastStore.getState().push(message, sub);
}

/** 挂载一次即可（Layout 已包含） */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div className="fixed top-16 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({ toast: t }: { toast: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <motion.div
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 40, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="pointer-events-auto relative flex items-center gap-2.5 overflow-hidden rounded-btn border border-border-subtle bg-raised px-4 py-3 shadow-float cursor-pointer"
      onClick={() => dismiss(t.id)}
    >
      <span className="absolute left-0 top-0 h-full w-[3px] bg-lime" />
      <CheckCircle2 className="h-4 w-4 text-lime shrink-0" />
      <div className="flex flex-col">
        <span className="text-[13px] font-medium text-text-primary leading-snug">{t.message}</span>
        {t.sub && <span className="font-mono text-[11px] text-text-muted">{t.sub}</span>}
      </div>
    </motion.div>
  );
}

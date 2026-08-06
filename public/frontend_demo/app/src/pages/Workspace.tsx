import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { FileUp, FolderOpen, History, SlidersHorizontal, Trash2 } from 'lucide-react';
import { getSessionById } from '@/data/mockSessions';
import { useSelectionStore, useWorkspaceStore, type LayoutMode } from '@/lib/store';
import { toast } from '@/components/Toast';
import SessionRail from '@/components/workspace/SessionRail';
import SessionPane, { type PaneViewOptions } from '@/components/workspace/SessionPane';
import EmptyPaneSlot from '@/components/workspace/EmptyPaneSlot';
import SessionPickerModal from '@/components/workspace/SessionPickerModal';
import RecentSessionsModal from '@/components/workspace/RecentSessionsModal';
import SelectionTray from '@/components/workspace/SelectionTray';
import { cn } from '@/lib/utils';

const LAYOUT_MODES: LayoutMode[] = [1, 2, 3, 4, 6, 8];
/** 每个布局模式的列数 */
const LAYOUT_COLS: Record<LayoutMode, number> = { 1: 1, 2: 2, 3: 3, 4: 2, 6: 3, 8: 4 };
const PANE_MIN_W = 340;

/** 布局弹簧（design.md §5：stiffness 300, damping 32，约 450ms） */
const LAYOUT_SPRING = { type: 'spring', stiffness: 300, damping: 32 } as const;

export default function Workspace() {
  const navigate = useNavigate();
  const slots = useWorkspaceStore((s) => s.slots);
  const layout = useWorkspaceStore((s) => s.layout);
  const setLayout = useWorkspaceStore((s) => s.setLayout);
  const assignSession = useWorkspaceStore((s) => s.assignSession);
  const removeSession = useWorkspaceStore((s) => s.removeSession);
  const clearSlots = useWorkspaceStore((s) => s.clearSlots);
  const toggleMessage = useSelectionStore((s) => s.toggleMessage);
  const selectRange = useSelectionStore((s) => s.selectRange);
  const clearSession = useSelectionStore((s) => s.clearSession);
  const selected = useSelectionStore((s) => s.selected);

  const [railCollapsed, setRailCollapsed] = useState(false);
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [recentOpen, setRecentOpen] = useState(false);
  const [focusModeSlot, setFocusModeSlot] = useState<number | null>(null);
  const [focusedSlot, setFocusedSlot] = useState<number | null>(null);
  const [focusPulse, setFocusPulse] = useState<{ slot: number; key: number }>({ slot: -1, key: 0 });
  const [hovered, setHovered] = useState<{ sessionId: string; messageId: string } | null>(null);
  const [view, setView] = useState<PaneViewOptions>({
    showTools: true,
    showTimestamps: true,
    compact: false,
  });
  const [viewOpen, setViewOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  /** Shift 范围连选锚点：sessionId → messageId */
  const anchorRef = useRef<Record<string, string>>({});
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(1200);

  // 响应式：容器不足时自动降档列数（workspace.md §3）
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setGridWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const desiredCols = focusModeSlot !== null ? 1 : LAYOUT_COLS[layout];
  const cols = Math.max(1, Math.min(desiredCols, Math.floor(gridWidth / PANE_MIN_W) || 1));
  const visibleSlots = useMemo(
    () => (focusModeSlot !== null ? [focusModeSlot] : Array.from({ length: layout }, (_, i) => i)),
    [focusModeSlot, layout],
  );

  const occupiedCount = useMemo(() => slots.filter(Boolean).length, [slots]);
  const openSessionIds = useMemo(
    () => new Set(slots.filter((s): s is string => s !== null)),
    [slots],
  );

  // 聚焦槽位的会话被关闭时退出聚焦模式
  useEffect(() => {
    if (focusModeSlot !== null && !slots[focusModeSlot]) setFocusModeSlot(null);
  }, [focusModeSlot, slots]);

  /** 选中 / Shift 范围连选 */
  const handleSelectMessage = useCallback(
    (sessionId: string, messageId: string, shiftKey: boolean) => {
      const session = getSessionById(sessionId);
      if (!session) return;
      const anchor = anchorRef.current[sessionId];
      if (shiftKey && anchor && anchor !== messageId) {
        const ids = session.messages.map((m) => m.id);
        const a = ids.indexOf(anchor);
        const b = ids.indexOf(messageId);
        if (a !== -1 && b !== -1) {
          const [from, to] = a < b ? [a, b] : [b, a];
          const range = ids.slice(from, to + 1);
          const current = useSelectionStore.getState().selected[sessionId] ?? [];
          const merged = new Set([...current, ...range]);
          selectRange(sessionId, ids.filter((id) => merged.has(id)));
          return;
        }
      }
      anchorRef.current[sessionId] = messageId;
      toggleMessage(sessionId, messageId);
    },
    [toggleMessage, selectRange],
  );

  const handleHoverMessage = useCallback((sessionId: string, messageId: string | null) => {
    setHovered(messageId ? { sessionId, messageId } : null);
  }, []);

  const focusSlot = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= 8) return;
      setFocusedSlot(idx);
      setFocusPulse((p) => ({ slot: idx, key: p.key + 1 }));
    },
    [],
  );

  // 键盘快捷键（workspace.md §4/§8）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        pickerSlot !== null ||
        recentOpen
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (/^[1-8]$/.test(e.key)) {
        e.preventDefault();
        focusSlot(Number(e.key) - 1);
        return;
      }
      if (e.key === '[' || e.key === ']') {
        e.preventDefault();
        const candidates = visibleSlots;
        if (candidates.length === 0) return;
        const cur = focusedSlot ?? -1;
        const pos = candidates.indexOf(cur);
        const next =
          e.key === ']'
            ? candidates[(pos + 1) % candidates.length]
            : candidates[(pos - 1 + candidates.length) % candidates.length];
        focusSlot(next);
        return;
      }
      if (e.key === ' ') {
        if (hovered) {
          e.preventDefault();
          anchorRef.current[hovered.sessionId] = hovered.messageId;
          toggleMessage(hovered.sessionId, hovered.messageId);
        }
        return;
      }
      if (e.key === 'Escape') {
        if (focusModeSlot !== null) {
          setFocusModeSlot(null);
          return;
        }
        if (focusedSlot !== null) {
          const sid = slots[focusedSlot];
          if (sid && (selected[sid]?.length ?? 0) > 0) clearSession(sid);
          setFocusedSlot(null);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    pickerSlot,
    recentOpen,
    visibleSlots,
    focusedSlot,
    focusModeSlot,
    hovered,
    slots,
    selected,
    toggleMessage,
    clearSession,
    focusSlot,
  ]);

  // 拖文件导入遮罩
  useEffect(() => {
    let depth = 0;
    const onDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        depth += 1;
        setDragOver(true);
      }
    };
    const onDragLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragOver(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragOver(false);
      toast('演示模式：暂未解析本地文件', '请从会话库选择示例会话');
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragover', onDragOver);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragover', onDragOver);
    };
  }, []);

  const handleAssign = useCallback(
    (slotIndex: number, sessionId: string) => {
      assignSession(slotIndex, sessionId);
      // 目标槽位超出当前布局时自动升档
      if (slotIndex >= layout) {
        const next = LAYOUT_MODES.find((m) => m > slotIndex);
        if (next) setLayout(next);
      }
      setPickerSlot(null);
    },
    [assignSession, layout, setLayout],
  );

  /** 清空全部会话（B） */
  const handleClearAll = useCallback(() => {
    if (occupiedCount === 0) return;
    if (window.confirm(`确定清空全部 ${occupiedCount} 个会话面板？`)) {
      clearSlots();
      setFocusModeSlot(null);
      setFocusedSlot(null);
      toast('已清空全部会话');
    }
  }, [occupiedCount, clearSlots]);

  /** 最近会话弹层确认：替换槽位并按序填入（C） */
  const handleOpenRecent = useCallback(
    (sessionIds: string[]) => {
      if (sessionIds.length === 0) return;
      clearSlots();
      sessionIds.forEach((id, i) => assignSession(i, id));
      // 布局升档以容纳全部会话
      const next = LAYOUT_MODES.find((m) => m >= sessionIds.length);
      if (next && next > layout) setLayout(next);
      setFocusModeSlot(null);
      setRecentOpen(false);
      toast(`已打开 ${sessionIds.length} 个最近会话`);
    },
    [clearSlots, assignSession, layout, setLayout],
  );

  /** 选中所有已打开会话的最近 N 条消息（E） */
  const selectLastN = useCallback(
    (n: number) => {
      const ids = slots.filter((s): s is string => s !== null);
      if (ids.length === 0) return;
      let total = 0;
      for (const sid of ids) {
        const session = getSessionById(sid);
        if (!session) continue;
        const last = session.messages.slice(-n).map((m) => m.id);
        selectRange(sid, last);
        total += last.length;
      }
      toast(`已选中 ${ids.length} 个会话的最近 ${n} 条 · 共 ${total} 段`);
    },
    [slots, selectRange],
  );

  return (
    <div className="flex h-[calc(100dvh-52px)] flex-col overflow-hidden bg-canvas">
      {/* 页内工具条：布局切换器 + 视图选项 */}
      <motion.div
        initial={{ y: -8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="relative flex h-10 shrink-0 items-center justify-center border-b border-border-subtle px-3"
      >
        {/* 左：最近会话 / 清空 / 选最近 N 条 */}
        <div className="absolute left-3 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setRecentOpen(true)}
            title="打开最近会话"
            className="flex h-7 items-center gap-1.5 rounded-btn border border-border-subtle px-2 text-[12px] text-text-muted transition-colors duration-150 hover:border-border-strong hover:text-text-secondary"
          >
            <History className="h-3.5 w-3.5" />
            最近会话
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            disabled={occupiedCount === 0}
            title="清空全部会话面板"
            className="flex h-7 items-center gap-1.5 rounded-btn border border-border-subtle px-2 text-[12px] text-text-muted transition-colors duration-150 hover:border-danger/60 hover:text-danger disabled:pointer-events-none disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            清空
          </button>
          <span className="mx-1 hidden h-4 w-px bg-border-subtle lg:block" />
          <div className="hidden items-center gap-0.5 lg:flex" title="选中所有已打开会话的最近 N 条消息">
            {[3, 5, 10].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => selectLastN(n)}
                disabled={occupiedCount === 0}
                className="flex h-7 items-center rounded-btn border border-transparent px-1.5 font-mono text-[11px] text-text-muted transition-colors duration-150 hover:border-border-subtle hover:text-lime disabled:pointer-events-none disabled:opacity-40"
              >
                近{n}条
              </button>
            ))}
          </div>
        </div>

        {/* 布局切换器 [1|2|3|4|6|8] */}
        <div className="flex items-center gap-0.5 rounded-full border border-border-subtle bg-panel p-0.5">
          {LAYOUT_MODES.map((mode) => {
            const active = layout === mode && focusModeSlot === null;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setFocusModeSlot(null);
                  setLayout(mode);
                }}
                title={`${mode} 面板布局`}
                className={cn(
                  'relative flex h-6 w-9 items-center justify-center rounded-full transition-colors duration-150',
                  active ? 'text-lime' : 'text-text-muted hover:text-text-secondary',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="layout-switcher-pill"
                    className="absolute inset-0 rounded-full bg-raised"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <MiniGridIcon mode={mode} />
              </button>
            );
          })}
        </div>

        {/* 视图选项 */}
        <div className="absolute right-3">
          <button
            type="button"
            onClick={() => setViewOpen((v) => !v)}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-btn border px-2 text-[12px] transition-colors duration-150',
              viewOpen
                ? 'border-border-strong bg-raised text-text-primary'
                : 'border-border-subtle text-text-muted hover:border-border-strong hover:text-text-secondary',
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            视图
          </button>
          <AnimatePresence>
            {viewOpen && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-8 z-40 w-44 rounded-btn border border-border-strong bg-raised p-1.5 shadow-float"
              >
                <ViewSwitch
                  label="显示工具调用"
                  checked={view.showTools}
                  onChange={(v) => setView((s) => ({ ...s, showTools: v }))}
                />
                <ViewSwitch
                  label="显示时间戳"
                  checked={view.showTimestamps}
                  onChange={(v) => setView((s) => ({ ...s, showTimestamps: v }))}
                />
                <ViewSwitch
                  label="紧凑模式"
                  checked={view.compact}
                  onChange={(v) => setView((s) => ({ ...s, compact: v }))}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* 主区：槽位栏 + 面板网格 */}
      <div className="flex min-h-0 flex-1">
        <SessionRail
          collapsed={railCollapsed}
          onToggleCollapse={() => setRailCollapsed((v) => !v)}
          onPickSlot={setPickerSlot}
        />

        <div ref={gridRef} className="min-w-0 flex-1 overflow-hidden p-2">
          {occupiedCount === 0 ? (
            <EmptyWorkspace
              onOpenLibrary={() => navigate('/library')}
              onPick={() => setPickerSlot(0)}
              onOpenRecent={() => setRecentOpen(true)}
            />
          ) : (
            <div
              className="grid h-full gap-2"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${Math.ceil(visibleSlots.length / cols)}, minmax(0, 1fr))`,
              }}
            >
              {visibleSlots.map((slotIndex) => {
                const sessionId = slots[slotIndex];
                const session = sessionId ? getSessionById(sessionId) : undefined;
                return (
                  <motion.div
                    key={`pane-${slotIndex}`}
                    layout
                    transition={LAYOUT_SPRING}
                    className="min-h-0 min-w-0"
                  >
                    {session ? (
                      <SessionPane
                        slotIndex={slotIndex}
                        session={session}
                        view={view}
                        focusPulse={focusPulse.slot === slotIndex ? focusPulse.key : 0}
                        focusMode={focusModeSlot === slotIndex}
                        onToggleFocusMode={() =>
                          setFocusModeSlot((cur) => (cur === slotIndex ? null : slotIndex))
                        }
                        onClose={() => removeSession(slotIndex)}
                        onSelectMessage={handleSelectMessage}
                        onHoverMessage={handleHoverMessage}
                      />
                    ) : (
                      <EmptyPaneSlot slotIndex={slotIndex} onPick={() => setPickerSlot(slotIndex)} />
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 底部摘选托盘 */}
      <SelectionTray />

      {/* 会话选择 Modal */}
      <SessionPickerModal
        slotIndex={pickerSlot}
        openSessionIds={openSessionIds}
        onAssign={handleAssign}
        onClose={() => setPickerSlot(null)}
      />

      {/* 最近会话弹层 */}
      <RecentSessionsModal
        open={recentOpen}
        onClose={() => setRecentOpen(false)}
        onOpen={handleOpenRecent}
      />

      {/* 拖文件落区遮罩 */}
      <AnimatePresence>
        {dragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-canvas/80 backdrop-blur-sm"
          >
            <div className="flex h-[70%] w-[80%] flex-col items-center justify-center gap-3 rounded-[16px] border-2 border-dashed border-lime/60 bg-lime/[0.05]">
              <FileUp className="h-8 w-8 text-lime" />
              <span className="text-[16px] font-bold text-lime">松手导入</span>
              <span className="font-mono text-[11px] text-text-secondary">.jsonl / .md / .db</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** 布局切换器微缩网格图标（1×1 / 1×2 / 1×3 / 2×2 / 2×3 / 2×4） */
function MiniGridIcon({ mode }: { mode: LayoutMode }) {
  const conf: Record<LayoutMode, { cols: number; cells: number }> = {
    1: { cols: 1, cells: 1 },
    2: { cols: 2, cells: 2 },
    3: { cols: 3, cells: 3 },
    4: { cols: 2, cells: 4 },
    6: { cols: 3, cells: 6 },
    8: { cols: 4, cells: 8 },
  };
  const { cols, cells } = conf[mode];
  return (
    <span
      className="relative grid gap-[2px]"
      style={{ gridTemplateColumns: `repeat(${cols}, 5px)` }}
    >
      {Array.from({ length: cells }, (_, i) => (
        <motion.span
          key={i}
          layout
          className="h-[5px] w-[5px] rounded-[1px] bg-current"
          transition={{ duration: 0.15 }}
        />
      ))}
    </span>
  );
}

function ViewSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-[6px] px-2 py-1.5 text-[12px] text-text-secondary transition-colors hover:bg-panel"
    >
      {label}
      <span
        className={cn(
          'relative h-4 w-7 rounded-full transition-colors duration-150',
          checked ? 'bg-lime' : 'bg-border-strong',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-3 w-3 rounded-full bg-canvas transition-transform duration-150',
            checked ? 'translate-x-3.5' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  );
}

/** 全空空态（workspace.md §7）：呼吸浮动插图 + 按钮组 */
function EmptyWorkspace({
  onOpenLibrary,
  onPick,
  onOpenRecent,
}: {
  onOpenLibrary: () => void;
  onPick: () => void;
  onOpenRecent: () => void;
}) {
  return (
    <div className="bg-grid-dots flex h-full flex-col items-center justify-center gap-4 rounded-[12px] border border-border-subtle bg-panel/40">
      <motion.img
        src="/empty-pane.svg"
        alt=""
        className="h-auto w-56"
        animate={{ y: [0, -6, 0, 6, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="text-center">
        <h2 className="text-h3 text-text-primary">工作台是空的</h2>
        <p className="mt-1 text-[13px] text-text-muted">
          从会话库挑选至多 8 个会话，或直接拖入会话文件
        </p>
      </div>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onOpenLibrary}
          className="flex h-9 items-center gap-1.5 rounded-btn bg-lime px-4 text-[13px] font-bold text-canvas transition-colors hover:bg-lime/90"
        >
          <FolderOpen className="h-4 w-4" />
          打开会话库
        </button>
        <button
          type="button"
          onClick={onPick}
          className="flex h-9 items-center gap-1.5 rounded-btn border border-border-strong px-4 text-[13px] font-medium text-text-secondary transition-colors hover:border-lime/50 hover:text-lime"
        >
          <FileUp className="h-4 w-4" />
          选择示例会话
        </button>
        <button
          type="button"
          onClick={onOpenRecent}
          className="flex h-9 items-center gap-1.5 rounded-btn border border-border-strong px-4 text-[13px] font-medium text-text-secondary transition-colors hover:border-lime/50 hover:text-lime"
        >
          <History className="h-4 w-4" />
          最近会话
        </button>
      </div>
      <span className="font-mono text-[10px] text-text-muted/60">1–8 聚焦面板 · Space 选中 · ⌘⇧C 复制托盘</span>
    </div>
  );
}

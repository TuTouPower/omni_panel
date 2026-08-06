import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, PanelLeftClose, PanelLeftOpen, Plus, Repeat2, X } from 'lucide-react';
import { AGENTS } from '@/lib/types';
import { getSessionById } from '@/data/mockSessions';
import { useWorkspaceStore } from '@/lib/store';
import AgentBadge from '@/components/AgentBadge';
import { formatTokens } from './format';
import { cn } from '@/lib/utils';

interface SessionRailProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onPickSlot: (slotIndex: number) => void;
}

/**
 * SessionRail — 左槽位栏（workspace.md §2）
 * 232px 可折叠至 48px；八槽位，拖拽换位（顺序 = 面板网格顺序）
 */
export default function SessionRail({ collapsed, onToggleCollapse, onPickSlot }: SessionRailProps) {
  const slots = useWorkspaceStore((s) => s.slots);
  const moveSession = useWorkspaceStore((s) => s.moveSession);
  const removeSession = useWorkspaceStore((s) => s.removeSession);

  const occupiedCount = useMemo(() => slots.filter(Boolean).length, [slots]);
  const firstEmpty = slots.findIndex((s) => s === null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = (e: DragEndEvent) => {
    const from = Number(e.active.id);
    const to = e.over ? Number(e.over.id) : -1;
    if (Number.isInteger(from) && Number.isInteger(to) && to >= 0 && from !== to) {
      moveSession(from, to);
    }
  };

  return (
    <motion.aside
      animate={{ width: collapsed ? 48 : 232 }}
      transition={{ type: 'spring', stiffness: 300, damping: 32 }}
      className="flex h-full shrink-0 flex-col overflow-hidden border-r border-border-subtle bg-canvas"
    >
      {/* 标题行 */}
      <div className="flex h-10 shrink-0 items-center gap-2 px-3">
        {!collapsed && (
          <>
            <span className="text-[12px] font-bold text-text-secondary">会话槽位</span>
            <span className="font-display text-[11px] font-medium text-text-muted">
              {occupiedCount}/8
            </span>
          </>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          title={collapsed ? '展开槽位栏' : '折叠槽位栏'}
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-chip text-text-muted transition-colors hover:bg-raised hover:text-text-primary',
            !collapsed && 'ml-auto',
          )}
        >
          {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* 槽位列表 */}
      {collapsed ? (
        <div className="flex flex-col items-center gap-2 px-2 py-2">
          {slots.map((id, i) => (
            <button
              key={i}
              type="button"
              onClick={() => (id ? onToggleCollapse() : onPickSlot(i))}
              title={id ? getSessionById(id)?.title : `空槽位 ${i + 1}`}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-[8px] border transition-colors',
                id
                  ? 'border-border-subtle bg-panel'
                  : 'border-dashed border-border-strong text-text-muted hover:border-solid hover:text-text-secondary',
              )}
            >
              {id ? (
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: AGENTS[getSessionById(id)!.agentId].color }}
                />
              ) : (
                <Plus className="h-3 w-3" />
              )}
            </button>
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={slots.map((_, i) => i)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex-1 space-y-1.5 overflow-y-auto px-2 py-1">
              <AnimatePresence initial={false}>
                {slots.map((id, i) =>
                  id ? (
                    <OccupiedSlot
                      key={`slot-${i}-${id}`}
                      slotIndex={i}
                      sessionId={id}
                      onRemove={() => removeSession(i)}
                      onReplace={() => onPickSlot(i)}
                    />
                  ) : (
                    <motion.button
                      key={`empty-${i}`}
                      type="button"
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                      transition={{ duration: 0.2 }}
                      onClick={() => onPickSlot(i)}
                      className="flex h-14 w-full items-center justify-center gap-1.5 rounded-[8px] border border-dashed border-border-strong text-[12px] text-text-muted transition-colors duration-150 hover:border-solid hover:bg-panel hover:text-text-secondary"
                    >
                      <Plus className="h-3 w-3" />
                      空槽位
                    </motion.button>
                  ),
                )}
              </AnimatePresence>
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* 底部：添加会话 */}
      {!collapsed && (
        <div className="shrink-0 border-t border-border-subtle p-2">
          <button
            type="button"
            disabled={firstEmpty === -1}
            onClick={() => firstEmpty !== -1 && onPickSlot(firstEmpty)}
            title={firstEmpty === -1 ? '最多同屏 8 个会话' : '添加会话到空槽位'}
            className={cn(
              'flex h-8 w-full items-center justify-center gap-1.5 rounded-btn border text-[13px] font-medium transition-colors duration-150',
              firstEmpty === -1
                ? 'cursor-not-allowed border-border-subtle text-text-muted/50'
                : 'border-lime/50 text-lime hover:border-lime hover:bg-lime-dim',
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            添加会话
          </button>
        </div>
      )}
    </motion.aside>
  );
}

function OccupiedSlot({
  slotIndex,
  sessionId,
  onRemove,
  onReplace,
}: {
  slotIndex: number;
  sessionId: string;
  onRemove: () => void;
  onReplace: () => void;
}) {
  const session = getSessionById(sessionId);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slotIndex,
  });
  if (!session) return null;
  const agent = AGENTS[session.agentId];

  return (
    <motion.div
      ref={setNodeRef}
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: isDragging ? 1.02 : 1 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.25, type: 'spring', stiffness: 300, damping: 30 }}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 30 : undefined,
      }}
      className={cn(
        'group/slot relative flex h-14 items-center gap-1.5 overflow-hidden rounded-[8px] border border-border-subtle bg-panel pl-2 pr-1.5',
        isDragging && 'shadow-float border-border-strong',
      )}
    >
      {/* Agent 色 3px 左条 */}
      <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full" style={{ backgroundColor: agent.color }} />

      {/* grip 拖拽手柄 */}
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-text-muted/40 transition-colors hover:text-text-muted active:cursor-grabbing"
        title="拖拽换位"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <AgentBadge agentId={session.agentId} compact />
          <span className="truncate text-[13px] font-medium text-text-primary">{session.title}</span>
        </div>
        <div className="truncate pl-0.5 font-mono text-[10px] text-text-muted">
          {session.turnCount}t · {formatTokens(session.tokenCount)}
        </div>
      </div>

      {/* hover 操作 */}
      <div className="flex shrink-0 flex-col gap-0.5 opacity-0 transition-opacity duration-150 group-hover/slot:opacity-100">
        <button
          type="button"
          title="替换会话"
          onClick={onReplace}
          className="flex h-5 w-5 items-center justify-center rounded text-text-muted transition-colors hover:bg-raised hover:text-text-primary"
        >
          <Repeat2 className="h-3 w-3" />
        </button>
        <button
          type="button"
          title="关闭会话"
          onClick={onRemove}
          className="flex h-5 w-5 items-center justify-center rounded text-text-muted transition-colors hover:bg-raised hover:text-danger"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </motion.div>
  );
}

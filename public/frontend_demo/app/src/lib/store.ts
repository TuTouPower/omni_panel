import { create } from 'zustand';
import type { Segment } from '@/lib/types';
import { getSessionById } from '@/data/mockSessions';

// ---------------------------------------------------------------------------
// useWorkspaceStore — 工作台槽位与布局
// ---------------------------------------------------------------------------

export type LayoutMode = 1 | 2 | 3 | 4 | 6 | 8;
export const SLOT_COUNT = 8;

interface WorkspaceState {
  /** 8 个槽位，值为 session id 或 null */
  slots: (string | null)[];
  layout: LayoutMode;
  setLayout: (layout: LayoutMode) => void;
  assignSession: (slotIndex: number, sessionId: string) => void;
  removeSession: (slotIndex: number) => void;
  moveSession: (from: number, to: number) => void;
  clearSlots: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()((set) => ({
  slots: Array<string | null>(SLOT_COUNT).fill(null),
  layout: 2,
  setLayout: (layout) => set({ layout }),
  assignSession: (slotIndex, sessionId) =>
    set((state) => {
      const slots = [...state.slots];
      // 同一会话已在其他槽位则先移除，避免重复
      const existing = slots.indexOf(sessionId);
      if (existing !== -1 && existing !== slotIndex) slots[existing] = null;
      slots[slotIndex] = sessionId;
      return { slots };
    }),
  removeSession: (slotIndex) =>
    set((state) => {
      const slots = [...state.slots];
      slots[slotIndex] = null;
      return { slots };
    }),
  moveSession: (from, to) =>
    set((state) => {
      const slots = [...state.slots];
      const tmp = slots[from];
      slots[from] = slots[to];
      slots[to] = tmp;
      return { slots };
    }),
  clearSlots: () => set({ slots: Array<string | null>(SLOT_COUNT).fill(null) }),
}));

// ---------------------------------------------------------------------------
// useSelectionStore — 跨会话消息摘选
// ---------------------------------------------------------------------------

interface SelectionState {
  /** sessionId → 已选 messageIds（按选择顺序） */
  selected: Record<string, string[]>;
  toggleMessage: (sessionId: string, messageId: string) => void;
  selectRange: (sessionId: string, messageIds: string[]) => void;
  clearSession: (sessionId: string) => void;
  clearAll: () => void;
}

export const useSelectionStore = create<SelectionState>()((set) => ({
  selected: {},
  toggleMessage: (sessionId, messageId) =>
    set((state) => {
      const current = state.selected[sessionId] ?? [];
      const next = current.includes(messageId)
        ? current.filter((id) => id !== messageId)
        : [...current, messageId];
      const selected = { ...state.selected };
      if (next.length === 0) delete selected[sessionId];
      else selected[sessionId] = next;
      return { selected };
    }),
  selectRange: (sessionId, messageIds) =>
    set((state) => {
      const selected = { ...state.selected };
      if (messageIds.length === 0) delete selected[sessionId];
      else selected[sessionId] = [...messageIds];
      return { selected };
    }),
  clearSession: (sessionId) =>
    set((state) => {
      const selected = { ...state.selected };
      delete selected[sessionId];
      return { selected };
    }),
  clearAll: () => set({ selected: {} }),
}));

/** 已选片段（按会话原始消息顺序排列） */
export function allSelectedSegments(): Segment[] {
  const { selected } = useSelectionStore.getState();
  const segments: Segment[] = [];
  for (const [sessionId, messageIds] of Object.entries(selected)) {
    const session = getSessionById(sessionId);
    if (!session) continue;
    const idSet = new Set(messageIds);
    for (const message of session.messages) {
      if (idSet.has(message.id)) {
        segments.push({
          id: `${sessionId}:${message.id}`,
          sessionId,
          sessionTitle: session.title,
          agentId: session.agentId,
          message,
        });
      }
    }
  }
  return segments;
}

/** 已选消息总数（托盘计数徽标用） */
export function selectedCount(selected: Record<string, string[]>): number {
  return Object.values(selected).reduce((sum, ids) => sum + ids.length, 0);
}

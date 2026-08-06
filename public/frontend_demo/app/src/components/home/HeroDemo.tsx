import { memo, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Copy } from 'lucide-react';
import type { AgentId } from '@/lib/types';
import { AGENTS } from '@/lib/types';
import { getSessionById } from '@/data/mockSessions';
import { cn } from '@/lib/utils';

/**
 * HeroDemo — 落地页 Hero 右侧的微缩工作台自演示模型（纯 CSS/JS 构建）。
 * 8s 循环脚本：
 *   1s   面板 A 一条消息亮起 lime 选中框
 *   2.4s 面板 B 两条消息亮起
 *   3.8s 底部摘选托盘浮起，3 个 SegmentChip 依次弹入（stagger 120ms）
 *   5.4s 托盘右侧「复制」按钮闪现对勾
 *   6.6s 全部复位
 */

// 三个微缩面板：Claude / Grok / OpenCode（数据取自 mockSessions）
const PANE_SOURCES = [
  { sessionId: 'sess-claude-1', agentId: 'claude' as AgentId, pick: [2] },
  { sessionId: 'sess-grok-1', agentId: 'grok' as AgentId, pick: [0, 3] },
  { sessionId: 'sess-opencode-1', agentId: 'opencode' as AgentId, pick: [] },
];

const BAR_COUNT = 5;

// 托盘芯片内容（取自真实 mock 消息，含 token 估算）
const TRAY_CHIPS = [
  { sessionId: 'sess-claude-1', msgIndex: 3, ref: 'A4' },
  { sessionId: 'sess-grok-1', msgIndex: 1, ref: 'A2' },
  { sessionId: 'sess-opencode-1', msgIndex: 2, ref: 'A3' },
].map(({ sessionId, msgIndex, ref }) => {
  const session = getSessionById(sessionId);
  const msg = session?.messages[msgIndex];
  const plain = (msg?.content ?? '').replace(/[#*`>\n]+/g, ' ').trim();
  return {
    agentId: session?.agentId ?? ('claude' as AgentId),
    abbr: session ? AGENTS[session.agentId].abbr : 'CC',
    ref,
    excerpt: plain.slice(0, 12),
    tokens: msg?.tokenEst ?? 128,
  };
});

// 预生成的稳定消息条宽度（40–90%）与面板标题
const BAR_WIDTHS: number[][] = PANE_SOURCES.map((_, p) =>
  Array.from({ length: BAR_COUNT }, (_, i) => {
    const seed = (p * 7 + i * 13) % 10;
    return 40 + ((seed * 37 + i * 11) % 50);
  }),
);
const PANE_TITLES: string[] = PANE_SOURCES.map((p) => getSessionById(p.sessionId)?.title ?? '');

interface DemoState {
  /** 面板 0 / 1 中被选中的消息条索引 */
  sel0: boolean;
  sel1a: boolean;
  sel1b: boolean;
  /** 托盘是否浮起 */
  tray: boolean;
  /** 已弹入托盘的芯片数 0–3 */
  chips: number;
  /** 复制按钮是否显示对勾 */
  copied: boolean;
}

const IDLE: DemoState = { sel0: false, sel1a: false, sel1b: false, tray: false, chips: 0, copied: false };

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

/** 单条微缩消息条（圆角灰条模拟文本行） */
function MsgBar({ width, selected }: { width: number; selected: boolean }) {
  return (
    <motion.div
      animate={{
        scale: selected ? 1 : 0.98,
        backgroundColor: selected ? 'rgba(198,246,61,0.12)' : 'rgba(22,28,37,1)',
        borderColor: selected ? 'rgba(198,246,61,0.85)' : 'rgba(30,38,50,0)',
      }}
      transition={{ duration: 0.3, ease: EASE }}
      className="h-[7px] rounded-[3px] border"
      style={{ width: `${width}%` }}
    />
  );
}

/** 微缩会话面板 */
function MiniPane({
  agentId,
  title,
  bars,
  selected,
}: {
  agentId: AgentId;
  title: string;
  bars: number[];
  selected: boolean[];
}) {
  const agent = AGENTS[agentId];
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[8px] border border-border-subtle bg-inset">
      <div className="h-[4px] w-full shrink-0" style={{ backgroundColor: agent.color }} />
      <div className="flex items-center gap-1.5 px-2 pt-2">
        <span className="h-[6px] w-[6px] shrink-0 rounded-full" style={{ backgroundColor: agent.color }} />
        <span className="truncate font-mono text-[9px] text-text-muted">{title}</span>
      </div>
      <div className="flex flex-col gap-[7px] px-2 py-2">
        {bars.map((w, i) => (
          <MsgBar key={i} width={w} selected={selected[i] ?? false} />
        ))}
      </div>
    </div>
  );
}

function HeroDemoInner() {
  const [state, setState] = useState<DemoState>(IDLE);

  useEffect(() => {
    let cancelled = false;
    let timers: ReturnType<typeof setTimeout>[] = [];

    const schedule = () => {
      const at = (ms: number, fn: () => void) => {
        timers.push(setTimeout(() => !cancelled && fn(), ms));
      };
      at(0, () => setState(IDLE));
      at(1000, () => setState((s) => ({ ...s, sel0: true })));
      at(2400, () => setState((s) => ({ ...s, sel1a: true })));
      at(2900, () => setState((s) => ({ ...s, sel1b: true })));
      at(3800, () => setState((s) => ({ ...s, tray: true })));
      at(3950, () => setState((s) => ({ ...s, chips: 1 })));
      at(4070, () => setState((s) => ({ ...s, chips: 2 })));
      at(4190, () => setState((s) => ({ ...s, chips: 3 })));
      at(5400, () => setState((s) => ({ ...s, copied: true })));
      at(6600, () => setState(IDLE));
      // 7.6s 后进入下一轮由 interval 重新调度
    };

    schedule();
    const interval = setInterval(() => {
      timers.forEach(clearTimeout);
      timers = [];
      schedule();
    }, 7600);

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      clearInterval(interval);
    };
  }, []);

  const selectedBars = PANE_SOURCES.map((p, pi) =>
    Array.from({ length: BAR_COUNT }, (_, i) => {
      if (!p.pick.includes(i)) return false;
      if (pi === 0) return state.sel0;
      if (pi === 1) return p.pick[0] === i ? state.sel1a : state.sel1b;
      return false;
    }),
  );

  return (
    <div className="relative overflow-hidden rounded-panel border border-border-subtle bg-panel shadow-float">
      {/* 模拟三圆点标题栏 */}
      <div className="flex h-9 items-center gap-1.5 border-b border-border-subtle px-3">
        <span className="h-2 w-2 rounded-full bg-danger/70" />
        <span className="h-2 w-2 rounded-full bg-agent-codex/70" />
        <span className="h-2 w-2 rounded-full bg-agent-opencode/70" />
        <span className="ml-2 font-mono text-[10px] text-text-muted">SessionGrid / 工作台</span>
        <span className="ml-auto font-mono text-[10px] text-text-muted">3 panes</span>
      </div>

      {/* 微缩面板区 */}
      <div className="flex gap-2 p-3 pb-14">
        {PANE_SOURCES.map((p, i) => (
          <MiniPane
            key={p.sessionId}
            agentId={p.agentId}
            title={PANE_TITLES[i]}
            bars={BAR_WIDTHS[i]}
            selected={selectedBars[i]}
          />
        ))}
      </div>

      {/* 摘选托盘（底部浮起） */}
      <AnimatePresence>
        {state.tray && (
          <motion.div
            initial={{ y: 48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 48, opacity: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="absolute inset-x-3 bottom-3 flex h-11 items-center gap-2 rounded-btn border border-border-strong bg-raised px-2.5"
          >
            <span className="shrink-0 font-mono text-[9px] text-text-muted">摘选托盘</span>
            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
              {TRAY_CHIPS.slice(0, state.chips).map((chip) => (
                <motion.span
                  key={chip.ref}
                  initial={{ y: 8, opacity: 0, scale: 0.9 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className="flex h-6 shrink-0 items-center gap-1 rounded-chip border border-border-subtle bg-panel px-1.5"
                >
                  <span
                    className="h-[5px] w-[5px] rounded-full"
                    style={{ backgroundColor: AGENTS[chip.agentId].color }}
                  />
                  <span className="font-mono text-[9px] text-text-secondary">
                    {chip.abbr}·{chip.ref}
                  </span>
                  <span className="hidden max-w-[72px] truncate text-[9px] text-text-muted sm:inline">
                    {chip.excerpt}
                  </span>
                  <span className="font-mono text-[8px] text-text-muted">{chip.tokens}t</span>
                </motion.span>
              ))}
            </div>
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-chip transition-colors duration-200',
                state.copied ? 'bg-lime text-canvas' : 'bg-lime/15 text-lime',
              )}
            >
              {state.copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const HeroDemo = memo(HeroDemoInner);
export default HeroDemo;

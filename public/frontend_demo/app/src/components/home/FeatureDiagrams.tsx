import { memo, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import type { AgentId } from '@/lib/types';
import { AGENTS, AGENT_LIST } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * FeatureDiagrams — 落地页三大功能区的 CSS/JS 微缩交互模型。
 * 全部为自运行的 Framer Motion 循环动画，memo 隔离，不接收 props。
 */

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const SPRING = { type: 'spring', stiffness: 400, damping: 30 } as const;

function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-panel border border-border-subtle bg-panel">
      <div className="flex h-8 items-center border-b border-border-subtle px-3">
        <span className="font-mono text-[10px] text-text-muted">{label}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// F1 多面板工作台：微缩网格中面板数 1→2→3→4→6 循环变形（layout 弹簧重排）
// ---------------------------------------------------------------------------

const LAYOUT_COUNTS = [1, 2, 3, 4, 6] as const;
const GRID_CLASS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-2',
  6: 'grid-cols-3',
};

function PanesMorphDiagramInner() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % LAYOUT_COUNTS.length), 2000);
    return () => clearInterval(t);
  }, []);

  const count = LAYOUT_COUNTS[step];

  return (
    <Frame label={`layout · ${count} ${count === 1 ? 'pane' : 'panes'}`}>
      <div className={cn('grid gap-2 transition-[grid-template-columns] duration-300', GRID_CLASS[count])}>
        {Array.from({ length: count }, (_, i) => {
          const agent = AGENT_LIST[i % AGENT_LIST.length];
          return (
            <motion.div
              key={i}
              layout
              transition={SPRING}
              className="h-16 overflow-hidden rounded-[8px] border border-border-subtle bg-inset"
            >
              <div className="h-[3px] w-full" style={{ backgroundColor: agent.color }} />
              <div className="flex flex-col gap-[6px] p-2">
                <div className="h-[6px] w-3/4 rounded-[3px] bg-raised" />
                <div className="h-[6px] w-1/2 rounded-[3px] bg-raised" />
              </div>
            </motion.div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        {LAYOUT_COUNTS.map((c, i) => (
          <span
            key={c}
            className={cn(
              'h-1 rounded-full transition-all duration-300',
              i === step ? 'w-4 bg-lime' : 'w-1 bg-border-strong',
            )}
          />
        ))}
        <span className="ml-auto font-mono text-[10px] text-text-muted">流体挤压重排 · 450ms spring</span>
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// F2 跨会话摘选：点击消息 → lime 勾选 → 底部托盘芯片弹入（每 1.6s 一步循环）
// ---------------------------------------------------------------------------

const CROSS_PANES: { agentId: AgentId; bars: number[] }[] = [
  { agentId: 'claude', bars: [78, 55, 88, 46] },
  { agentId: 'grok', bars: [64, 82, 50, 72] },
];

// 选择脚本：[面板索引, 消息条索引]
const CROSS_SCRIPT: [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 2],
];

function CrossSelectDiagramInner() {
  // phase 0..3：已完成的勾选步数（3 = 全部勾选完），随后复位
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setPhase((p) => (p >= 4 ? 0 : p + 1)), 1600);
    return () => clearInterval(t);
  }, []);

  const doneSteps = Math.min(phase, 3);
  const resetting = phase === 4;
  const selectedSet = new Set(resetting ? [] : CROSS_SCRIPT.slice(0, doneSteps).map(([p, m]) => `${p}:${m}`));
  const chipCount = resetting ? 0 : doneSteps;

  return (
    <Frame label="selection · cross-session">
      <div className="flex gap-2">
        {CROSS_PANES.map((pane, pi) => {
          const agent = AGENTS[pane.agentId];
          return (
            <div
              key={pi}
              className="min-w-0 flex-1 overflow-hidden rounded-[8px] border border-border-subtle bg-inset"
            >
              <div className="h-[3px] w-full" style={{ backgroundColor: agent.color }} />
              <div className="flex flex-col gap-[9px] p-2.5">
                {pane.bars.map((w, mi) => {
                  const on = selectedSet.has(`${pi}:${mi}`);
                  return (
                    <div key={mi} className="flex items-center gap-1.5">
                      <motion.span
                        animate={{
                          backgroundColor: on ? '#C6F63D' : 'rgba(22,28,37,1)',
                          borderColor: on ? '#C6F63D' : '#2C3746',
                        }}
                        transition={{ duration: 0.25, ease: EASE }}
                        className="flex h-3 w-3 shrink-0 items-center justify-center rounded-[3px] border"
                      >
                        {on && <Check className="h-2 w-2 text-canvas" strokeWidth={4} />}
                      </motion.span>
                      <motion.div
                        animate={{
                          backgroundColor: on ? 'rgba(198,246,61,0.12)' : 'rgba(22,28,37,1)',
                        }}
                        transition={{ duration: 0.3, ease: EASE }}
                        className="h-[7px] rounded-[3px]"
                        style={{ width: `${w}%` }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* 托盘 */}
      <div className="mt-3 flex h-8 items-center gap-1.5 rounded-btn border border-border-subtle bg-raised px-2">
        <span className="shrink-0 font-mono text-[9px] text-text-muted">托盘</span>
        <AnimatePresence>
          {Array.from({ length: chipCount }, (_, i) => {
            const [pi, mi] = CROSS_SCRIPT[i];
            const agent = AGENTS[CROSS_PANES[pi].agentId];
            return (
              <motion.span
                key={`${pi}:${mi}`}
                initial={{ y: 8, opacity: 0, scale: 0.9 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={SPRING}
                className="flex h-5 items-center gap-1 rounded-chip border border-border-subtle bg-panel px-1.5"
              >
                <span className="h-[5px] w-[5px] rounded-full" style={{ backgroundColor: agent.color }} />
                <span className="font-mono text-[9px] text-text-secondary">
                  {agent.abbr}·A{mi + 1}
                </span>
              </motion.span>
            );
          })}
        </AnimatePresence>
        <span className="ml-auto font-mono text-[9px] text-text-muted">{chipCount} 片段</span>
      </div>
    </Frame>
  );
}

export const PanesMorphDiagram = memo(PanesMorphDiagramInner);
export const CrossSelectDiagram = memo(CrossSelectDiagramInner);

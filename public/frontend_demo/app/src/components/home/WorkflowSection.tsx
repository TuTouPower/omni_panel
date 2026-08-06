import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { Check, FileJson, FileText, Database } from 'lucide-react';
import { AGENT_LIST } from '@/lib/types';

/**
 * WorkflowSection — 落地页「工作流程」Pinned 叙事（design/home.md §4）。
 * GSAP ScrollTrigger pin 住整节，滚动进度驱动三张大步骤卡依次激活：
 * 未激活卡 scale 0.92 + 30% 透明 + 去色；激活卡全彩 + 顶部 lime 进度条随滚动填充。
 * 底部总进度条 scaleX 0→1 随滚动。
 */

gsap.registerPlugin(ScrollTrigger, useGSAP);

const STEPS = [
  {
    no: '01',
    title: '导入',
    desc: '拖入 .jsonl / .md / .db 会话文件，纯前端解析，不出本机。',
  },
  {
    no: '02',
    title: '并排打开',
    desc: '在会话库勾选至多 8 个会话，一键铺满工作台。',
  },
  {
    no: '03',
    title: '摘选 & 复制',
    desc: '勾选片段 → 托盘 → Ctrl+C。',
  },
];

/** 步骤 1 动态：微缩文件卡飘入虚线框 */
function ImportVisual() {
  return (
    <div className="relative flex h-24 items-center justify-center overflow-hidden rounded-btn border border-dashed border-border-strong bg-inset">
      {[
        { icon: FileJson, label: '.jsonl', cls: 'wf-float', delay: '0s' },
        { icon: FileText, label: '.md', cls: 'wf-float', delay: '0.6s' },
        { icon: Database, label: '.db', cls: 'wf-float', delay: '1.2s' },
      ].map((f) => (
        <div
          key={f.label}
          className={`mx-2 flex flex-col items-center gap-1 rounded-chip border border-border-subtle bg-panel px-2.5 py-2 ${f.cls}`}
          style={{ animationDelay: f.delay }}
        >
          <f.icon className="h-4 w-4 text-text-secondary" />
          <span className="font-mono text-[9px] text-text-muted">{f.label}</span>
        </div>
      ))}
      <span className="absolute bottom-1.5 right-2 font-mono text-[9px] text-text-muted">本地解析</span>
    </div>
  );
}

/** 步骤 2 动态：6 个色点滑入 6 个槽位 */
function SlotsVisual() {
  return (
    <div className="flex h-24 items-center justify-center gap-2 rounded-btn border border-border-subtle bg-inset">
      {AGENT_LIST.map((agent, i) => (
        <div
          key={agent.id}
          className="flex h-14 w-7 items-center justify-center rounded-[6px] border border-dashed border-border-strong"
        >
          <span
            className="wf-slot-pop h-3 w-3 rounded-full"
            style={{ backgroundColor: agent.color, animationDelay: `${i * 0.18}s` }}
          />
        </div>
      ))}
    </div>
  );
}

/** 步骤 3 动态：芯片弹入托盘 → 对勾闪现 */
function CopyVisual() {
  return (
    <div className="flex h-24 flex-col items-center justify-center gap-3 rounded-btn border border-border-subtle bg-inset">
      <div className="flex items-center gap-1.5">
        {AGENT_LIST.slice(0, 3).map((agent, i) => (
          <span
            key={agent.id}
            className="wf-slot-pop flex h-6 items-center gap-1 rounded-chip border border-border-subtle bg-panel px-1.5"
            style={{ animationDelay: `${i * 0.25}s` }}
          >
            <span className="h-[5px] w-[5px] rounded-full" style={{ backgroundColor: agent.color }} />
            <span className="font-mono text-[9px] text-text-secondary">{agent.abbr}</span>
          </span>
        ))}
      </div>
      <div className="wf-check-pulse flex h-7 w-7 items-center justify-center rounded-full bg-lime">
        <Check className="h-4 w-4 text-canvas" strokeWidth={3} />
      </div>
    </div>
  );
}

const VISUALS = [ImportVisual, SlotsVisual, CopyVisual];

export default function WorkflowSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const cards = gsap.utils.toArray<HTMLElement>('.wf-card', pinRef.current);
      const bars = gsap.utils.toArray<HTMLElement>('.wf-card-bar', pinRef.current);
      if (cards.length !== 3 || bars.length !== 3) return;

      // 初始：卡 1 激活，卡 2/3 收缩 + 透明 + 去色；进度条归零
      gsap.set([cards[1], cards[2]], { scale: 0.92, opacity: 0.35, filter: 'grayscale(1)' });
      gsap.set(bars, { scaleX: 0, transformOrigin: 'left center' });
      gsap.set(progressRef.current, { scaleX: 0, transformOrigin: 'left center' });

      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: pinRef.current,
          start: 'top top',
          end: '+=1600',
          pin: true,
          scrub: 0.6,
          anticipatePin: 1,
        },
      });

      // 底部总进度条随全程填充
      tl.to(progressRef.current, { scaleX: 1, duration: 3 }, 0);
      // 卡 1 进度条 + 停留
      tl.to(bars[0], { scaleX: 1, duration: 0.9 }, 0);
      // 切换：卡 1 → 卡 2
      tl.to(cards[0], { scale: 0.92, opacity: 0.35, filter: 'grayscale(1)', duration: 0.35 }, 0.95);
      tl.to(cards[1], { scale: 1, opacity: 1, filter: 'grayscale(0)', duration: 0.35 }, 0.95);
      tl.to(bars[1], { scaleX: 1, duration: 0.9 }, 1.1);
      // 切换：卡 2 → 卡 3
      tl.to(cards[1], { scale: 0.92, opacity: 0.35, filter: 'grayscale(1)', duration: 0.35 }, 2.0);
      tl.to(cards[2], { scale: 1, opacity: 1, filter: 'grayscale(0)', duration: 0.35 }, 2.0);
      tl.to(bars[2], { scaleX: 1, duration: 0.9 }, 2.15);
      tl.to({}, { duration: 0.05 }, 3);
    },
    { scope: sectionRef },
  );

  return (
    <section id="workflow" ref={sectionRef} className="relative border-t border-border-subtle">
      <div ref={pinRef} className="flex min-h-[100dvh] flex-col justify-center overflow-hidden py-16">
        <div className="mx-auto w-full max-w-6xl px-4">
          <p className="font-mono text-[12px] text-text-muted">{'// workflow'}</p>
          <h2 className="mt-3 text-h1 md:text-[2.75rem]">
            三步，从零到复制<span className="text-lime">。</span>
          </h2>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, i) => {
              const Visual = VISUALS[i];
              return (
                <div
                  key={step.no}
                  className="wf-card relative overflow-hidden rounded-panel border border-border-subtle bg-panel will-change-transform"
                >
                  {/* 激活进度条（lime，随滚动填充） */}
                  <div className="wf-card-bar h-[3px] w-full bg-lime" />
                  <div className="p-6">
                    <div className="flex items-baseline justify-between">
                      <span
                        className="font-display text-[64px] font-bold leading-none text-transparent"
                        style={{ WebkitTextStroke: '1px #2C3746' }}
                      >
                        {step.no}
                      </span>
                      <span className="font-mono text-[11px] text-text-muted">
                        step {step.no} / 03
                      </span>
                    </div>
                    <h3 className="mt-4 text-h2">{step.title}</h3>
                    <p className="mt-2 min-h-[3.4em] text-[13px] leading-relaxed text-text-secondary">
                      {step.desc}
                    </p>
                    <div className="mt-5">
                      <Visual />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 底部总进度条 */}
          <div className="mt-10 h-[3px] w-full overflow-hidden rounded-full bg-border-subtle">
            <div ref={progressRef} className="h-full w-full bg-lime" />
          </div>
        </div>
      </div>
    </section>
  );
}

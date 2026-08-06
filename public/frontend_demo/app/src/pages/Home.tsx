import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { useGSAP } from '@gsap/react';
import Lenis from 'lenis';
import { Check, Code2, MessagesSquare, Wrench } from 'lucide-react';
import type { AgentId } from '@/lib/types';
import { AGENTS, AGENT_LIST } from '@/lib/types';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Kbd from '@/components/Kbd';
import { Toaster } from '@/components/Toast';
import HeroDemo from '@/components/home/HeroDemo';
import { PanesMorphDiagram, CrossSelectDiagram } from '@/components/home/FeatureDiagrams';
import WorkflowSection from '@/components/home/WorkflowSection';
import ExportTabs from '@/components/home/ExportTabs';

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);

const EASE_EXPO = 'expo.out';

/** 词级拆分动画用的小块包裹 */
function W({ children }: { children: ReactNode }) {
  return (
    <span data-w className="inline-block will-change-transform">
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 数据
// ---------------------------------------------------------------------------

const AGENT_CARDS: { id: AgentId; source: string; note: string }[] = [
  { id: 'claude', source: '~/.claude/projects/**/*.jsonl', note: '含工具调用与 diff 记录' },
  { id: 'grok', source: '导出 JSON / 会话分享链接', note: '结构化消息与附件解析' },
  { id: 'opencode', source: '~/.local/share/opencode/', note: '会话存储，含 part 级结构' },
  { id: 'codex', source: '~/.codex/sessions/*.jsonl', note: 'rollout 事件流回放' },
  { id: 'cursor', source: 'composer 会话导出 Markdown', note: '保留代码块与引用文件' },
  { id: 'aider', source: '.aider.chat.history.md', note: '对话日志与 commit 关联' },
];

const FEATURES = [
  {
    no: '01',
    title: ['1 到 8 个会话，', '同屏并排'],
    body: '一个会话看思路，八个会话看差异。面板自由增删、拖拽排序、独立滚动，布局切换流体动画，像整理桌面窗口一样整理 Agent 的对话。',
    bullets: ['1 / 2 / 3 / 4 / 6 / 8 六种布局预设', '面板拖拽换位', '单面板聚焦模式'],
    diagram: <PanesMorphDiagram />,
  },
  {
    no: '02',
    title: ['这条和那条，', '我都要'],
    body: 'Claude 的修复方案、Grok 的边界处理、OpenCode 的测试用例——不必截屏拼接。hover 任意消息勾选，或 Shift 连选一段，片段自动汇入底部托盘，跨会话归为一组，一次复制直接可用。',
    bullets: ['单选 / Shift 范围连选', '代码块、diff、工具调用均可单独摘选', '托盘实时统计 token'],
    diagram: <CrossSelectDiagram />,
  },
];

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['⌘', 'K'], label: '命令面板' },
  { keys: ['1', '–', '8'], label: '聚焦面板' },
  { keys: ['Space'], label: '选中片段' },
  { keys: ['Shift', '+', 'Click'], label: '连选' },
  { keys: ['⌘', '⇧', 'C'], label: '复制托盘' },
  { keys: ['Esc'], label: '退出选择' },
  { keys: ['[', '/', ']'], label: '切换面板' },
  { keys: ['⌘', 'F'], label: '搜索会话' },
];

const STATS = [
  { n: 6, label: '支持的 Agent' },
  { n: 8, label: '同屏面板上限' },
  { n: 4, label: '导出格式' },
  { n: 0, label: '上传的字节' },
];

const MARQUEE_ITEMS = [...AGENT_LIST, ...AGENT_LIST];

// ---------------------------------------------------------------------------
// Home — 落地页（design/home.md）
// ---------------------------------------------------------------------------

export default function Home() {
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const noteRef = useRef<HTMLParagraphElement>(null);
  const trustRef = useRef<HTMLParagraphElement>(null);
  const demoRef = useRef<HTMLDivElement>(null);
  const ctaTitleRef = useRef<HTMLHeadingElement>(null);

  // Lenis 平滑滚动 + ScrollTrigger 同步 + 锚点平滑跳转
  useEffect(() => {
    const lenis = new Lenis({ lerp: 0.11, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a[href^="#"]');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href === '#') return;
      const el = document.querySelector(href);
      if (!el) return;
      e.preventDefault();
      lenis.scrollTo(el as HTMLElement, { offset: -56 });
    };
    document.addEventListener('click', onClick);

    return () => {
      document.removeEventListener('click', onClick);
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);

  useGSAP(
    () => {
      const scope = rootRef.current;
      if (!scope) return;

      // ---- Hero 入场编排 ----
      const titleSplit = new SplitText(titleRef.current, { type: 'chars' });
      gsap.set(titleRef.current, { perspective: 600 });

      const tl = gsap.timeline({ defaults: { ease: EASE_EXPO } });
      tl.fromTo(dotsRef.current, { opacity: 0 }, { opacity: 0.6, duration: 1 }, 0);
      tl.from(noteRef.current, { opacity: 0, y: 8, duration: 0.5 }, 0.1);
      tl.from(
        titleSplit.chars,
        { y: 24, opacity: 0, rotateX: 40, transformOrigin: '50% 100%', stagger: 0.028, duration: 0.8 },
        0.1,
      );
      tl.from('.hero-sub > span', { y: 12, opacity: 0, stagger: 0.04, duration: 0.6 }, 0.4);
      tl.from('.hero-cta', { y: 16, opacity: 0, stagger: 0.08, duration: 0.5 }, 0.7);
      tl.from(trustRef.current, { opacity: 0, duration: 0.5 }, 0.9);
      tl.fromTo(
        demoRef.current,
        { x: 60, opacity: 0, rotateY: 6, transformPerspective: 900 },
        { x: 0, opacity: 1, rotateY: 0, duration: 0.9 },
        0.5,
      );

      // Hero 演示模型滚动视差（0.85 倍速率轻微上移）
      gsap.to(demoRef.current, {
        y: -60,
        ease: 'none',
        scrollTrigger: { trigger: heroRef.current, start: 'top top', end: 'bottom top', scrub: true },
      });

      // ---- 通用滚动 reveal ----
      gsap.utils.toArray<HTMLElement>('[data-reveal]', scope).forEach((el) => {
        gsap.from(el, {
          x: Number(el.dataset.revealX ?? 0),
          y: Number(el.dataset.revealY ?? 32),
          opacity: 0,
          duration: Number(el.dataset.revealDuration ?? 0.7),
          delay: Number(el.dataset.revealDelay ?? 0),
          ease: EASE_EXPO,
          scrollTrigger: { trigger: el, start: el.dataset.revealStart ?? 'top 85%' },
        });
      });

      // ---- 子元素 stagger 组 ----
      gsap.utils.toArray<HTMLElement>('[data-reveal-group]', scope).forEach((group) => {
        gsap.from(group.children, {
          y: Number(group.dataset.revealY ?? 32),
          opacity: 0,
          duration: Number(group.dataset.revealDuration ?? 0.6),
          stagger: Number(group.dataset.revealStagger ?? 0.09),
          delay: Number(group.dataset.revealDelay ?? 0),
          ease: EASE_EXPO,
          scrollTrigger: { trigger: group, start: 'top 85%' },
        });
      });

      // ---- 词级标题 stagger ----
      gsap.utils.toArray<HTMLElement>('[data-words]', scope).forEach((el) => {
        gsap.from(el.querySelectorAll('[data-w]'), {
          y: 14,
          opacity: 0,
          duration: 0.55,
          stagger: 0.05,
          ease: EASE_EXPO,
          scrollTrigger: { trigger: el, start: 'top 85%' },
        });
      });

      // ---- 数据带滚动计数 ----
      gsap.utils.toArray<HTMLElement>('[data-count]', scope).forEach((el, i) => {
        const numEl = el.querySelector('.stat-num');
        const counter = { v: 0 };
        gsap.to(counter, {
          v: Number(el.dataset.count),
          duration: 1.2,
          delay: i * 0.1,
          ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 70%' },
          onUpdate: () => {
            if (numEl) numEl.textContent = String(Math.round(counter.v));
          },
        });
      });

      // ---- 终段 CTA 标题字符级 stagger ----
      const ctaSplit = new SplitText(ctaTitleRef.current, { type: 'chars' });
      gsap.from(ctaSplit.chars, {
        y: 20,
        opacity: 0,
        stagger: 0.02,
        duration: 0.7,
        ease: EASE_EXPO,
        scrollTrigger: { trigger: ctaTitleRef.current, start: 'top 80%' },
      });

      return () => {
        titleSplit.revert();
        ctaSplit.revert();
      };
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} className="min-h-[100dvh] bg-canvas text-text-primary">
      {/* 页面级 CSS 动画（marquee / workflow 微动画） */}
      <style>{`
        @keyframes sg-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .sg-marquee-track { animation: sg-marquee 30s linear infinite; }
        .sg-marquee:hover .sg-marquee-track { animation-play-state: paused; }
        @keyframes wf-float { 0%,100% { transform: translateY(3px); opacity: .55; } 50% { transform: translateY(-4px); opacity: 1; } }
        .wf-float { animation: wf-float 2.8s ease-in-out infinite; }
        @keyframes wf-slot-pop { 0% { transform: scale(0); opacity: 0; } 18% { transform: scale(1.2); opacity: 1; } 32%,78% { transform: scale(1); opacity: 1; } 100% { transform: scale(.6); opacity: 0; } }
        .wf-slot-pop { animation: wf-slot-pop 2.6s ease-in-out infinite; }
        @keyframes wf-check-pulse { 0%,55% { transform: scale(.6); opacity: 0; } 70% { transform: scale(1.12); opacity: 1; } 82%,92% { transform: scale(1); opacity: 1; } 100% { transform: scale(.6); opacity: 0; } }
        .wf-check-pulse { animation: wf-check-pulse 2.6s ease-in-out infinite; }
      `}</style>

      <Navbar />
      <Toaster />

      {/* ============================== Section 1 — Hero ============================== */}
      <section ref={heroRef} className="relative overflow-hidden">
        {/* 点阵纹理背景（径向渐隐） */}
        <div
          ref={dotsRef}
          className="bg-grid-dots pointer-events-none absolute inset-0 opacity-0"
          style={{
            backgroundSize: '32px 32px',
            maskImage: 'radial-gradient(ellipse 90% 80% at 50% 40%, black 20%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 90% 80% at 50% 40%, black 20%, transparent 75%)',
          }}
        />
        <div className="relative mx-auto grid min-h-[100dvh] max-w-6xl items-center gap-12 px-4 pb-20 pt-32 lg:grid-cols-[5fr_7fr] lg:pt-24">
          {/* 左：文案 */}
          <div>
            <p ref={noteRef} className="font-mono text-[12px] text-text-muted">
              {'// claude-code · grok-build · opencode · codex · cursor · aider'}
            </p>
            <h1 ref={titleRef} className="text-display mt-5">
              六个 Agent 的会话，
              <br />
              一屏尽览。
            </h1>
            <p className="hero-sub mt-6 max-w-[520px] text-[17px] leading-relaxed text-text-secondary">
              <span className="inline-block">SessionGrid 把 </span>
              <span className="inline-block text-agent-claude">Claude Code、</span>
              <span className="inline-block text-agent-grok">Grok Build、</span>
              <span className="inline-block text-agent-opencode">OpenCode </span>
              <span className="inline-block">等 Coding Agent 的会话历史并排铺开——</span>
              <span className="inline-block">点选任意几条记录，</span>
              <span className="inline-block">跨会话汇成一份，</span>
              <span className="inline-block">复制成你需要的格式。</span>
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/workspace"
                className="hero-cta group flex h-11 items-center gap-2 rounded-btn bg-lime px-6 text-[14px] font-bold text-canvas transition hover:brightness-110"
              >
                进入工作台
                <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
              </Link>
              <Link
                to="/library"
                className="hero-cta flex h-11 items-center rounded-btn border border-border-subtle px-6 text-[14px] font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
              >
                浏览会话库
              </Link>
            </div>
            <p ref={trustRef} className="mt-8 font-mono text-[12px] text-text-muted">
              纯前端 · 本地解析 · 0 数据上传
            </p>
          </div>

          {/* 右：动态演示模型 */}
          <div ref={demoRef} className="will-change-transform">
            <HeroDemo />
            <p className="mt-3 text-center font-mono text-[11px] text-text-muted">
              {'// live demo · 跨会话摘选 · 8s loop'}
            </p>
          </div>
        </div>
      </section>

      {/* ====================== Section 2 — Agent 跑马灯 + 支持矩阵 ====================== */}
      <section id="agents" className="border-t border-border-subtle">
        {/* 2a. Logo Marquee */}
        <div className="sg-marquee flex h-24 items-center overflow-hidden border-b border-border-subtle">
          <div className="sg-marquee-track flex w-max items-center gap-14 pr-14">
            {MARQUEE_ITEMS.map((agent, i) => (
              <div key={`${agent.id}-${i}`} className="flex items-center gap-3" aria-hidden={i >= AGENT_LIST.length}>
                <img src={`/agent-${agent.id}.svg`} alt={agent.name} className="h-8 w-8" />
                <span className="whitespace-nowrap text-[14px] font-medium text-text-secondary">{agent.name}</span>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: agent.color }} />
              </div>
            ))}
          </div>
        </div>

        {/* 2b. 支持矩阵 */}
        <div className="mx-auto max-w-6xl px-4 py-24">
          <p className="font-mono text-[12px] text-text-muted">{'// supported agents'}</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <h2 data-words className="text-h1">
              <W>已适配 </W>
              <W>6 种主流 </W>
              <W>Coding Agent </W>
              <W>的会话格式</W>
            </h2>
            <p data-reveal className="font-mono text-[12px] text-text-muted">
              *.jsonl · *.md · *.db → SessionGrid
            </p>
          </div>

          <div data-reveal-group data-reveal-stagger="0.09" className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {AGENT_CARDS.map(({ id, source, note }) => {
              const agent = AGENTS[id];
              return (
                <div
                  key={id}
                  className="group relative overflow-hidden rounded-panel border border-border-subtle bg-panel transition-all duration-200 hover:-translate-y-1 hover:border-border-strong"
                >
                  <div
                    className="h-[4px] w-full opacity-80 transition-opacity duration-200 group-hover:opacity-100"
                    style={{ backgroundColor: agent.color }}
                  />
                  <div className="p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img src={`/agent-${id}.svg`} alt="" className="h-9 w-9" />
                        <div>
                          <h3 className="text-h3">{agent.name}</h3>
                          <p className="font-mono text-[11px] text-text-muted">{agent.model}</p>
                        </div>
                      </div>
                      <span className="rounded-chip border border-lime/40 px-2 py-0.5 font-mono text-[10px] text-lime">
                        已适配
                      </span>
                    </div>
                    <p className="mt-4 font-mono text-[12px] leading-relaxed text-text-secondary">{source}</p>
                    <p className="mt-1 text-[13px] text-text-secondary">{note}</p>
                    <div className="mt-4 flex items-center gap-4 border-t border-border-subtle pt-3">
                      <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
                        <MessagesSquare className="h-3.5 w-3.5" /> 轮次
                      </span>
                      <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
                        <Wrench className="h-3.5 w-3.5" /> 工具调用
                      </span>
                      <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
                        <Code2 className="h-3.5 w-3.5" /> 代码块
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ========================= Section 3 — 三大功能 ========================= */}
      <section id="features" className="border-t border-border-subtle">
        {FEATURES.map((f, i) => {
          const flip = i % 2 === 1;
          return (
            <div
              key={f.no}
              className="mx-auto grid min-h-[90dvh] max-w-6xl items-center gap-10 px-4 py-20 md:grid-cols-2 md:gap-16"
            >
              {/* 动态示意图（奇数块图左文右，偶数块反之） */}
              <div
                data-reveal
                data-reveal-x={flip ? 48 : -48}
                data-reveal-y={0}
                data-reveal-start="top 80%"
                className={flip ? 'md:order-2' : ''}
              >
                {f.diagram}
              </div>

              {/* 文案 */}
              <div className={flip ? 'md:order-1' : ''}>
                <span
                  className="font-display text-[64px] font-bold leading-none text-transparent"
                  style={{ WebkitTextStroke: '1px #2C3746' }}
                >
                  {f.no}
                </span>
                <h2 data-words className="mt-4 text-h1">
                  {f.title.map((chunk, j) => (
                    <W key={j}>{chunk}</W>
                  ))}
                </h2>
                <p data-reveal data-reveal-y={16} className="mt-5 max-w-[480px] leading-relaxed text-text-secondary">
                  {f.body}
                </p>
                <ul data-reveal-group data-reveal-stagger="0.08" data-reveal-y={12} className="mt-6 flex flex-col gap-3">
                  {f.bullets.map((b) => (
                    <li key={b} className="flex items-center gap-2.5 text-[14px] text-text-primary">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-lime-dim">
                        <Check className="h-2.5 w-2.5 text-lime" strokeWidth={3.5} />
                      </span>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </section>

      {/* ========================= Section 4 — 工作流程（Pinned） ========================= */}
      <WorkflowSection />

      {/* ========================= Section 5 — 导出格式展示 ========================= */}
      <section className="border-t border-border-subtle">
        <div className="mx-auto max-w-6xl px-4 py-24">
          <p className="font-mono text-[12px] text-text-muted">{'// export formats'}</p>
          <h2 data-words className="mt-3 text-h1">
            <W>摘出来的东西，</W>
            <W>长什么样</W>
            <W>由你定</W>
          </h2>
          <p data-reveal data-reveal-y={16} className="mt-4 text-text-secondary">
            四种格式，一键切换，复制即用。
          </p>
          <div data-reveal data-reveal-y={24} className="mt-10">
            <ExportTabs />
          </div>
        </div>
      </section>

      {/* ========================= Section 6 — 快捷键条 ========================= */}
      <section id="shortcuts" className="border-t border-border-subtle bg-panel/40">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 data-reveal data-reveal-y={12} className="text-center text-h3 text-text-secondary">
            为键盘党准备
          </h2>
          <div className="mt-8 overflow-x-auto pb-2">
            <div
              data-reveal-group
              data-reveal-stagger="0.06"
              data-reveal-y={10}
              className="flex w-max items-center gap-8 md:w-full md:justify-center"
            >
              {SHORTCUTS.map((s, i) => (
                <div key={s.label} className="group flex items-center gap-8">
                  {i > 0 && <span className="h-6 w-px bg-border-subtle" />}
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <span className="flex items-center gap-1">
                      {s.keys.map((k, j) =>
                        k === '+' || k === '–' || k === '/' ? (
                          <span key={j} className="font-mono text-[11px] text-text-muted">
                            {k}
                          </span>
                        ) : (
                          <Kbd
                            key={j}
                            className="transition-all duration-150 group-hover:-translate-y-0.5 group-hover:border-lime group-hover:text-lime"
                          >
                            {k}
                          </Kbd>
                        ),
                      )}
                    </span>
                    <span className="text-[13px] text-text-secondary">{s.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===================== Section 7 — 数据带 + 终段 CTA ===================== */}
      <section className="relative overflow-hidden border-t border-border-subtle">
        <div className="bg-grid-dots pointer-events-none absolute inset-0 opacity-40" />
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(circle at 50% 62%, rgba(198,246,61,0.06), transparent 55%)' }}
        />

        {/* 数据带 */}
        <div
          data-reveal-group
          data-reveal-stagger="0.1"
          data-reveal-y={20}
          className="relative mx-auto grid max-w-6xl grid-cols-2 gap-px px-4 pt-20 lg:grid-cols-4"
        >
          {STATS.map((s) => (
            <div key={s.label} data-count={s.n} className="flex flex-col items-center gap-1 py-6">
              <span className="stat-num font-display text-[40px] font-bold leading-none text-text-primary">0</span>
              <span className="text-[13px] text-text-secondary">{s.label}</span>
            </div>
          ))}
        </div>

        {/* 终段 CTA */}
        <div className="relative mx-auto flex max-w-6xl flex-col items-center px-4 pb-32 pt-24 text-center">
          <h2 ref={ctaTitleRef} className="text-h1 max-w-3xl md:text-[2.75rem]">
            现在，把八个会话放进一块屏幕。
          </h2>
          <div data-reveal-group data-reveal-stagger="0.08" data-reveal-y={16} data-reveal-delay="0.3" className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/workspace"
              className="group flex h-12 items-center gap-2 rounded-btn bg-lime px-8 text-[15px] font-bold text-canvas transition-transform duration-200 hover:scale-[1.03]"
            >
              进入工作台
              <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
            </Link>
            <Link
              to="/library"
              className="flex h-12 items-center rounded-btn border border-border-subtle px-8 text-[15px] font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
            >
              先在会话库逛逛
            </Link>
          </div>
          <p className="mt-8 font-mono text-[12px] text-text-muted">{'// 6 panes · 1 screen · 0 upload'}</p>
        </div>
      </section>

      {/* ============================== Section 8 — Footer ============================== */}
      <Footer />
    </div>
  );
}

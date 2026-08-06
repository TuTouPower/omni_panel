import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, LayoutGrid, List, Loader2, Search, X } from 'lucide-react';
import type { AgentId, Session } from '@/lib/types';
import { AGENTS, AGENT_LIST } from '@/lib/types';
import { mockSessions } from '@/data/mockSessions';
import { useWorkspaceStore } from '@/lib/store';
import { toast } from '@/components/Toast';
import ImportDropzone from '@/components/library/ImportDropzone';
import SessionCard from '@/components/library/SessionCard';
import SelectionDock from '@/components/library/SelectionDock';
import PreviewDrawer from '@/components/library/PreviewDrawer';
import { formatTokens, sessionTags } from '@/components/library/sessionMeta';
import { cn } from '@/lib/utils';

const MAX_SELECT = 8;

type SortKey = 'recent' | 'tokens' | 'turns' | 'oldest';
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: '最近活跃' },
  { key: 'tokens', label: 'Token 最多' },
  { key: 'turns', label: '轮次最多' },
  { key: 'oldest', label: '最早创建' },
];

type TagFilter = 'error' | 'code' | 'long';
const TAG_FILTERS: { key: TagFilter; label: string }[] = [
  { key: 'error', label: '含错误' },
  { key: 'code', label: '含代码' },
  { key: 'long', label: '长会话(>11 轮)' },
];

export default function Library() {
  const navigate = useNavigate();
  const clearSlots = useWorkspaceStore((s) => s.clearSlots);
  const assignSession = useWorkspaceStore((s) => s.assignSession);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [agents, setAgents] = useState<Set<AgentId>>(new Set());
  const [tagFilters, setTagFilters] = useState<Set<TagFilter>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<Session | null>(null);
  const [launching, setLaunching] = useState(false);
  const [shake, setShake] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadedAll, setLoadedAll] = useState(false);

  // 搜索 spinner 模拟（300ms）
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onQueryChange = (value: string) => {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!value) {
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(() => setSearching(false), 300);
  };

  // sticky 工具栏滚动描边
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const stats = useMemo(() => {
    const tokens = mockSessions.reduce((sum, s) => sum + s.tokenCount, 0);
    const agentCount = new Set(mockSessions.map((s) => s.agentId)).size;
    return { sessions: mockSessions.length, tokens, agentCount };
  }, []);

  const countByAgent = useMemo(() => {
    const map = new Map<AgentId, number>();
    for (const s of mockSessions) map.set(s.agentId, (map.get(s.agentId) ?? 0) + 1);
    return map;
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = mockSessions.filter((s) => {
      if (agents.size > 0 && !agents.has(s.agentId)) return false;
      const tags = sessionTags(s);
      if (tagFilters.has('error') && !tags.hasError) return false;
      if (tagFilters.has('code') && !tags.hasCode) return false;
      if (tagFilters.has('long') && !tags.isLong) return false;
      if (q) {
        const haystack = `${s.title}\n${s.filePath}\n${s.messages.map((m) => m.content).join('\n')}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'tokens':
          return b.tokenCount - a.tokenCount;
        case 'turns':
          return b.turnCount - a.turnCount;
        case 'oldest':
          return a.date.localeCompare(b.date);
        case 'recent':
        default:
          return b.date.localeCompare(a.date);
      }
    });
    return list;
  }, [query, agents, tagFilters, sortKey]);

  const selectedSessions = useMemo(
    () => selectedIds.map((id) => mockSessions.find((s) => s.id === id)).filter((s): s is Session => Boolean(s)),
    [selectedIds],
  );

  const hasActiveFilter = query.trim() !== '' || agents.size > 0 || tagFilters.size > 0;

  const clearFilters = () => {
    setQuery('');
    setAgents(new Set());
    setTagFilters(new Set());
  };

  const toggleAgent = (id: AgentId) => {
    setAgents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTagFilter = (key: TagFilter) => {
    setTagFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelect = (session: Session) => {
    setSelectedIds((prev) => {
      if (prev.includes(session.id)) return prev.filter((id) => id !== session.id);
      if (prev.length >= MAX_SELECT) {
        setShake((n) => n + 1);
        toast('最多选择 8 个会话', '并排打开的上限是 8 个面板');
        return prev;
      }
      return [...prev, session.id];
    });
  };

  const openInWorkspace = (sessions: Session[]) => {
    clearSlots();
    sessions.forEach((s, i) => assignSession(i, s.id));
  };

  const openSingle = (session: Session) => {
    openInWorkspace([session]);
    navigate('/workspace');
  };

  const openSelected = () => {
    if (selectedSessions.length === 0) return;
    setLaunching(true);
    openInWorkspace(selectedSessions);
    setTimeout(() => navigate('/workspace'), 550);
  };

  const loadMore = () => {
    setLoadingMore(true);
    setTimeout(() => {
      setLoadingMore(false);
      setLoadedAll(true);
      toast('已加载全部会话', `Demo 数据集共 ${mockSessions.length} 个会话`);
    }, 800);
  };

  return (
    <div className="min-h-[calc(100dvh-52px)]">
      {/* 页头区（非 sticky） */}
      <div className="mx-auto max-w-[1200px] px-6 pt-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-h1 flex">
            {'会话库'.split('').map((ch, i) => (
              <motion.span
                key={ch}
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: i * 0.04, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="inline-block"
              >
                {ch}
              </motion.span>
            ))}
          </h1>
          <p className="font-mono text-[12px] text-text-muted">
            <span className="font-display text-text-secondary">{stats.sessions}</span> 个会话 ·{' '}
            <span className="font-display text-text-secondary">{stats.agentCount}</span> 个 Agent ·{' '}
            <span className="font-display text-text-secondary">{formatTokens(stats.tokens)}</span> tokens
          </p>
        </div>
        <ImportDropzone />
      </div>

      {/* 筛选工具栏（sticky） */}
      <div
        className={cn(
          'sticky top-[52px] z-30 mt-6 bg-canvas/85 backdrop-blur-md transition-shadow duration-200',
          scrolled && 'shadow-[0_1px_0_0_var(--border-subtle)]',
        )}
      >
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-3 gap-y-2 px-6 py-3">
          {/* 搜索框 */}
          <div className="relative">
            {searching ? (
              <Loader2 className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-lime" />
            ) : (
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
            )}
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="搜索会话标题、消息内容、文件名…"
              className="h-8 w-[300px] rounded-btn border border-border-subtle bg-inset pl-8 pr-7 text-[13px] text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-border-strong"
            />
            {query && (
              <button
                type="button"
                aria-label="清除搜索"
                onClick={() => onQueryChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Agent 筛选芯片组 */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAgents(new Set())}
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-chip border px-2.5 text-[12px] font-medium transition-colors duration-150',
                agents.size === 0
                  ? 'border-lime bg-raised text-text-primary'
                  : 'border-border-subtle text-text-secondary hover:border-border-strong',
              )}
            >
              全部
              <span className="font-mono text-[11px] text-text-muted">{mockSessions.length}</span>
            </button>
            {AGENT_LIST.map((agent) => {
              const active = agents.has(agent.id);
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => toggleAgent(agent.id)}
                  className={cn(
                    'flex h-7 items-center gap-1.5 rounded-chip border px-2.5 text-[12px] font-medium transition-colors duration-150',
                    active
                      ? 'border-lime bg-raised text-text-primary'
                      : 'border-border-subtle text-text-secondary hover:border-border-strong',
                  )}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: agent.color }} />
                  {agent.name}
                  <span className="font-mono text-[11px] text-text-muted">{countByAgent.get(agent.id) ?? 0}</span>
                </button>
              );
            })}
          </div>

          {/* 次级筛选 Toggle 芯片 */}
          <div className="flex items-center gap-1.5">
            {TAG_FILTERS.map((f) => {
              const active = tagFilters.has(f.key);
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => toggleTagFilter(f.key)}
                  className={cn(
                    'h-7 rounded-chip border px-2.5 text-[12px] font-medium transition-colors duration-150',
                    active
                      ? 'border-lime/60 bg-lime-dim text-lime'
                      : 'border-border-subtle text-text-muted hover:border-border-strong hover:text-text-secondary',
                  )}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* 排序 + 视图切换 */}
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="h-8 appearance-none rounded-btn border border-border-subtle bg-panel pl-3 pr-8 text-[12px] font-medium text-text-secondary outline-none transition-colors hover:border-border-strong focus:border-border-strong"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
            </div>
            <div className="flex h-8 items-center rounded-btn border border-border-subtle bg-panel p-0.5">
              {(
                [
                  { key: 'grid', icon: LayoutGrid, label: '网格视图' },
                  { key: 'list', icon: List, label: '列表视图' },
                ] as const
              ).map((v) => (
                <button
                  key={v.key}
                  type="button"
                  title={v.label}
                  aria-label={v.label}
                  onClick={() => setView(v.key)}
                  className={cn(
                    'flex h-7 w-8 items-center justify-center rounded-[6px] transition-colors duration-150',
                    view === v.key ? 'bg-raised text-lime' : 'text-text-muted hover:text-text-secondary',
                  )}
                >
                  <v.icon className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 会话卡片网格 */}
      <div className="mx-auto max-w-[1200px] px-6 py-6">
        {filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-3 py-24 text-center"
          >
            <motion.img
              src="/import-illustration.svg"
              alt=""
              className="h-32 w-auto opacity-70"
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            />
            <p className="font-mono text-[12px] text-text-muted">// 0 results</p>
            <p className="text-[14px] text-text-secondary">没有匹配的会话，试试放宽筛选</p>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-1 h-8 rounded-btn border border-border-strong px-4 text-[13px] font-medium text-text-primary transition-colors hover:border-lime hover:text-lime"
              >
                清除筛选
              </button>
            )}
          </motion.div>
        ) : view === 'grid' ? (
          <motion.div layout className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {filtered.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  selected={selectedIds.includes(s.id)}
                  order={selectedIds.indexOf(s.id) + 1}
                  disabled={selectedIds.length >= MAX_SELECT}
                  onToggle={() => toggleSelect(s)}
                  onOpenSingle={() => openSingle(s)}
                  onPreview={() => setPreview(s)}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div layout className="flex flex-col gap-2">
            <AnimatePresence mode="popLayout">
              {filtered.map((s) => {
                const selected = selectedIds.includes(s.id);
                const tags = sessionTags(s);
                return (
                  <motion.div
                    key={s.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.2 } }}
                    onClick={() => toggleSelect(s)}
                    className={cn(
                      'flex cursor-pointer items-center gap-4 rounded-panel border bg-panel px-4 py-3 transition-colors duration-150',
                      selected ? 'border-lime bg-lime/[0.05]' : 'border-border-subtle hover:border-border-strong',
                    )}
                  >
                    <span
                      className="h-9 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: AGENTS[s.agentId].color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-bold text-text-primary">{s.title}</p>
                      <p className="truncate font-mono text-[11px] text-text-muted">
                        {s.turnCount} 轮 · {formatTokens(s.tokenCount)} tok · {s.date}
                        {tags.hasError && <span className="ml-2 text-danger">含错误</span>}
                        {tags.hasCode && <span className="ml-2">含代码</span>}
                        {tags.isLong && <span className="ml-2">长会话</span>}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreview(s);
                      }}
                      className="h-7 rounded-chip border border-border-subtle px-2.5 text-[12px] text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
                    >
                      预览
                    </button>
                    <span
                      className={cn(
                        'flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border',
                        selected ? 'border-lime bg-lime' : 'border-border-strong',
                      )}
                    >
                      {selected && (
                        <svg viewBox="0 0 12 12" className="h-3 w-3 text-canvas">
                          <path d="M2 6.5 5 9.5 10 2.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}

        {/* 加载更多 */}
        {filtered.length > 0 && !loadedAll && (
          <div className="mt-8 flex flex-col items-center gap-4">
            {loadingMore && (
              <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-[180px] animate-pulse rounded-panel border border-border-subtle bg-panel"
                    style={{ animationDelay: `${i * 120}ms` }}
                  />
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="flex h-9 items-center gap-2 rounded-btn border border-border-strong px-5 text-[13px] font-medium text-text-primary transition-colors hover:border-lime hover:text-lime disabled:opacity-60"
            >
              {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              加载更多
            </button>
          </div>
        )}
      </div>

      {/* 底部选择坞 */}
      <motion.div
        key={shake}
        animate={shake > 0 ? { x: [0, -4, 4, -4, 4, 0] } : undefined}
        transition={{ duration: 0.3 }}
      >
        <SelectionDock
          sessions={selectedSessions}
          launching={launching}
          onRemove={(id) => setSelectedIds((prev) => prev.filter((x) => x !== id))}
          onClear={() => setSelectedIds([])}
          onOpen={openSelected}
        />
      </motion.div>

      {/* 预览抽屉 */}
      <PreviewDrawer
        session={preview}
        selected={preview ? selectedIds.includes(preview.id) : false}
        onClose={() => setPreview(null)}
        onOpenSingle={(s) => {
          setPreview(null);
          openSingle(s);
        }}
        onToggleSelect={toggleSelect}
      />
    </div>
  );
}

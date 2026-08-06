import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import CopyButton from '@/components/CopyButton';

/**
 * ExportTabs — 落地页「导出格式展示」（design/home.md §5）。
 * shadcn Tabs：Markdown / JSON / 纯文本 / Prompt，代码面板带行号 + 语法着色，
 * 同一份「跨会话摘选」（Claude Code 与 OpenCode 两个来源）在四种格式下的真实样例。
 * Tab 切换：面板 y 8→0 + opacity 250ms；代码行 stagger 15ms 淡入。
 */

type Token = { t: string; c?: string };
type Line = Token[];

const MUTED = 'text-text-muted';
const SEC = 'text-text-secondary';
const PRI = 'text-text-primary';
const LIME = 'text-lime';
const CLAUDE = 'text-agent-claude';
const OC = 'text-agent-opencode';
const AMBER = 'text-agent-codex';
const BLUE = 'text-agent-grok';

const SAMPLES: Record<string, Line[]> = {
  markdown: [
    [{ t: '> ', c: MUTED }, { t: '**来源** ', c: LIME }, { t: 'Claude Code', c: CLAUDE }, { t: ' · 修复 JWT 鉴权中间件的过期判断 · ', c: SEC }, { t: 'U3/A4', c: MUTED }],
    [{ t: '' }],
    [{ t: '建议将过期判断改为自适应秒/毫秒，并增加 leeway 缓冲：', c: PRI }],
    [{ t: '' }],
    [{ t: '```ts', c: MUTED }],
    [{ t: '// exp 可能是秒或毫秒时间戳，自适应判断', c: MUTED }],
    [{ t: 'const ', c: BLUE }, { t: 'expMs ', c: PRI }, { t: '= payload.exp < ', c: SEC }, { t: '1e12', c: AMBER }, { t: ' ? payload.exp * ', c: SEC }, { t: '1000', c: AMBER }, { t: ' : payload.exp;', c: SEC }],
    [{ t: 'const ', c: BLUE }, { t: 'leewayMs ', c: PRI }, { t: '= (config.jwtLeeway ?? ', c: SEC }, { t: '30', c: AMBER }, { t: ') * ', c: SEC }, { t: '1000', c: AMBER }, { t: ';', c: SEC }],
    [{ t: '```', c: MUTED }],
    [{ t: '' }],
    [{ t: '---', c: MUTED }],
    [{ t: '' }],
    [{ t: '> ', c: MUTED }, { t: '**来源** ', c: LIME }, { t: 'OpenCode', c: OC }, { t: ' · 补充 JWT 边界单测 · ', c: SEC }, { t: 'A5', c: MUTED }],
    [{ t: '' }],
    [{ t: '单测需覆盖秒级 exp、毫秒级 exp 与 leeway 窗口三种情况。', c: PRI }],
  ],
  json: [
    [{ t: '{', c: SEC }],
    [{ t: '  "segments"', c: OC }, { t: ': [', c: SEC }],
    [{ t: '    {', c: SEC }],
    [{ t: '      "agent"', c: OC }, { t: ': ', c: SEC }, { t: '"claude-code"', c: LIME }, { t: ',', c: SEC }],
    [{ t: '      "session"', c: OC }, { t: ': ', c: SEC }, { t: '"修复 JWT 鉴权中间件的过期判断"', c: LIME }, { t: ',', c: SEC }],
    [{ t: '      "ref"', c: OC }, { t: ': ', c: SEC }, { t: '"A4"', c: LIME }, { t: ',', c: SEC }],
    [{ t: '      "tokens"', c: OC }, { t: ': ', c: SEC }, { t: '340', c: AMBER }, { t: ',', c: SEC }],
    [{ t: '      "content"', c: OC }, { t: ': ', c: SEC }, { t: '"建议将过期判断改为自适应秒/毫秒……"', c: LIME }],
    [{ t: '    },', c: SEC }],
    [{ t: '    {', c: SEC }],
    [{ t: '      "agent"', c: OC }, { t: ': ', c: SEC }, { t: '"opencode"', c: LIME }, { t: ',', c: SEC }],
    [{ t: '      "session"', c: OC }, { t: ': ', c: SEC }, { t: '"补充 JWT 边界单测"', c: LIME }, { t: ',', c: SEC }],
    [{ t: '      "ref"', c: OC }, { t: ': ', c: SEC }, { t: '"A5"', c: LIME }, { t: ',', c: SEC }],
    [{ t: '      "tokens"', c: OC }, { t: ': ', c: SEC }, { t: '128', c: AMBER }, { t: ',', c: SEC }],
    [{ t: '      "content"', c: OC }, { t: ': ', c: SEC }, { t: '"单测需覆盖秒级 exp、毫秒级 exp……"', c: LIME }],
    [{ t: '    }', c: SEC }],
    [{ t: '  ]', c: SEC }],
    [{ t: '}', c: SEC }],
  ],
  text: [
    [{ t: '── claude-code / 修复 JWT 鉴权中间件的过期判断 / A4 ──────────', c: CLAUDE }],
    [{ t: '' }],
    [{ t: '建议将过期判断改为自适应秒/毫秒，并增加 leeway 缓冲：', c: PRI }],
    [{ t: 'const expMs = payload.exp < 1e12 ? payload.exp * 1000 : payload.exp;', c: SEC }],
    [{ t: '' }],
    [{ t: '── opencode / 补充 JWT 边界单测 / A5 ────────────────────────', c: OC }],
    [{ t: '' }],
    [{ t: '单测需覆盖秒级 exp、毫秒级 exp 与 leeway 窗口三种情况。', c: PRI }],
  ],
  prompt: [
    [{ t: '<context>', c: LIME }],
    [{ t: '  <segment', c: LIME }, { t: ' source', c: OC }, { t: '=', c: SEC }, { t: '"claude-code"', c: AMBER }, { t: ' ref', c: OC }, { t: '=', c: SEC }, { t: '"A4"', c: AMBER }, { t: ' tokens', c: OC }, { t: '=', c: SEC }, { t: '"340"', c: AMBER }, { t: '>', c: LIME }],
    [{ t: '    建议将过期判断改为自适应秒/毫秒，并增加 leeway 缓冲……', c: SEC }],
    [{ t: '  </segment>', c: LIME }],
    [{ t: '  <segment', c: LIME }, { t: ' source', c: OC }, { t: '=', c: SEC }, { t: '"opencode"', c: AMBER }, { t: ' ref', c: OC }, { t: '=', c: SEC }, { t: '"A5"', c: AMBER }, { t: ' tokens', c: OC }, { t: '=', c: SEC }, { t: '"128"', c: AMBER }, { t: '>', c: LIME }],
    [{ t: '    单测需覆盖秒级 exp、毫秒级 exp 与 leeway 窗口三种情况。', c: SEC }],
    [{ t: '  </segment>', c: LIME }],
    [{ t: '</context>', c: LIME }],
  ],
};

const FORMATS = [
  { id: 'markdown', label: 'Markdown' },
  { id: 'json', label: 'JSON' },
  { id: 'text', label: '纯文本' },
  { id: 'prompt', label: 'Prompt' },
] as const;

function plainText(lines: Line[]): string {
  return lines.map((l) => l.map((tk) => tk.t).join('')).join('\n');
}

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

export default function ExportTabs() {
  const [format, setFormat] = useState<string>('markdown');
  const lines = SAMPLES[format];

  return (
    <Tabs value={format} onValueChange={setFormat} className="gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList className="border border-border-subtle bg-panel">
          {FORMATS.map((f) => (
            <TabsTrigger
              key={f.id}
              value={f.id}
              className="font-mono text-[12px] text-text-secondary data-[state=active]:bg-raised data-[state=active]:text-lime data-[state=active]:shadow-none"
            >
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-text-muted">2 来源 · 2 片段 · 468 tokens</span>
          <CopyButton
            text={plainText(lines)}
            toastMessage={`已复制 ${FORMATS.find((f) => f.id === format)?.label} 示例`}
            className="h-7 w-7"
          />
        </div>
      </div>

      <div className="relative overflow-hidden rounded-panel border border-border-subtle bg-inset">
        <div className="flex h-9 items-center justify-between border-b border-border-subtle px-3">
          <span className="font-mono text-[10px] text-text-muted">
            export-preview.{format === 'markdown' ? 'md' : format === 'json' ? 'json' : format === 'text' ? 'txt' : 'xml'}
          </span>
          <span className="font-mono text-[10px] text-text-muted">复制此示例 →</span>
        </div>
        <AnimatePresence mode="wait">
          <TabsContent key={format} value={format} className="mt-0">
            <motion.div
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="flex overflow-x-auto p-4"
            >
              {/* 行号 */}
              <div className="mr-4 flex select-none flex-col text-right font-mono text-[13px] leading-[1.8] text-text-muted/50">
                {lines.map((_, i) => (
                  <span key={i}>{i + 1}</span>
                ))}
              </div>
              <div className="flex min-w-0 flex-1 flex-col font-mono text-[13px] leading-[1.8]">
                {lines.map((line, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.015, duration: 0.2 }}
                    className="whitespace-pre"
                  >
                    {line.length === 0 || (line.length === 1 && line[0].t === '') ? (
                      ' '
                    ) : (
                      line.map((tk, j) => (
                        <span key={j} className={tk.c ?? SEC}>
                          {tk.t}
                        </span>
                      ))
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </TabsContent>
        </AnimatePresence>
      </div>
    </Tabs>
  );
}

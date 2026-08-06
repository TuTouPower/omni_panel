import type { Message, Segment, Session } from '@/lib/types';
import { AGENTS } from '@/lib/types';
import { getSessionById } from '@/data/mockSessions';

/** 38200 → '38.2k'；4218 → '4,218' */
export function formatTokens(n: number): string {
  if (n >= 10000) {
    const k = n / 1000;
    return `${k >= 100 ? Math.round(k) : k.toFixed(1)}k`;
  }
  return n.toLocaleString('en-US');
}

/** 消息在同角色中的序号标签：U3（用户第 3 条）/ A5（助手第 5 条） */
export function roleLabel(session: Session, messageId: string): string {
  const msg = session.messages.find((m) => m.id === messageId);
  if (!msg) return '?';
  let idx = 0;
  for (const m of session.messages) {
    if (m.role === msg.role) idx += 1;
    if (m.id === messageId) break;
  }
  return `${msg.role === 'user' ? 'U' : 'A'}${idx}`;
}

export function segmentLabel(s: Segment): string {
  const session = getSessionById(s.sessionId);
  if (!session) return '?';
  return roleLabel(session, s.message.id);
}

/** 'HH:mm' → 分钟数 */
export function timeToMinutes(ts: string): number {
  const [h, m] = ts.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** 片段摘要：取首行纯文本，截断 n 字 */
export function segmentSummary(content: string, n = 14): string {
  const plain = content
    .replace(/[#*`\n>+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > n ? `${plain.slice(0, n)}…` : plain;
}

const KIND_NAME: Record<Message['kind'], string> = {
  text: '文本',
  code: '代码',
  tool: '工具',
  diff: '变更',
};

function segmentHeading(s: Segment): string {
  const session = getSessionById(s.sessionId);
  const agent = AGENTS[s.agentId];
  const label = session ? roleLabel(session, s.message.id) : '?';
  const who = s.message.role === 'user' ? '用户' : '助手';
  const kind = s.message.kind === 'text' ? '' : ` · ${KIND_NAME[s.message.kind]}`;
  return `${label} · ${who}${kind} · ${agent.name} · ${s.message.timestamp}`;
}

/** Markdown 格式 */
export function buildMarkdown(segments: Segment[]): string {
  return segments
    .map((s) => {
      const body =
        s.message.kind === 'code'
          ? `\`\`\`${s.message.language ?? ''}\n${s.message.content}\n\`\`\``
          : s.message.kind === 'diff'
            ? `\`\`\`diff\n${s.message.content}\n\`\`\``
            : s.message.content;
      return `#### ${segmentHeading(s)}\n\n${body}`;
    })
    .join('\n\n---\n\n');
}

/** 纯文本格式 */
export function buildPlain(segments: Segment[]): string {
  return segments.map((s) => `[${segmentHeading(s)}]\n${s.message.content}`).join('\n\n');
}

/** 按会话分组的 Markdown */
export function buildGrouped(segments: Segment[]): string {
  const bySession = new Map<string, Segment[]>();
  for (const s of segments) {
    const list = bySession.get(s.sessionId) ?? [];
    list.push(s);
    bySession.set(s.sessionId, list);
  }
  const parts: string[] = [];
  for (const [sessionId, list] of bySession) {
    const session = getSessionById(sessionId);
    const agent = AGENTS[list[0].agentId];
    const header = `## ${agent.name} · ${session?.title ?? sessionId}`;
    const body = list
      .map((s) => {
        const text =
          s.message.kind === 'code'
            ? `\`\`\`${s.message.language ?? ''}\n${s.message.content}\n\`\`\``
            : s.message.kind === 'diff'
              ? `\`\`\`diff\n${s.message.content}\n\`\`\``
              : s.message.content;
        return `**${segmentHeading(s)}**\n\n${text}`;
      })
      .join('\n\n');
    parts.push(`${header}\n\n${body}`);
  }
  return parts.join('\n\n---\n\n');
}

export type CopyFormat = 'markdown' | 'plain' | 'grouped';

export const COPY_FORMATS: { id: CopyFormat; label: string }[] = [
  { id: 'markdown', label: 'Markdown' },
  { id: 'plain', label: '纯文本' },
  { id: 'grouped', label: '按会话分组' },
];

export function buildCopyText(segments: Segment[], format: CopyFormat): string {
  if (format === 'plain') return buildPlain(segments);
  if (format === 'grouped') return buildGrouped(segments);
  return buildMarkdown(segments);
}

/** 复制到剪贴板（含 execCommand 兜底），返回是否成功 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

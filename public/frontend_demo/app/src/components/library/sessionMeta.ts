import type { Session } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

/** 412k 风格的 token 简写 */
export function formatTokens(n: number): string {
  if (n >= 1000) {
    const v = n / 1000;
    return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(n);
}

/** 相对日期，如「3 天前」 */
export function relativeDate(date: string): string {
  try {
    return formatDistanceToNow(new Date(`${date}T12:00:00`), { addSuffix: true, locale: zhCN });
  } catch {
    return date;
  }
}

/** 首条用户消息 */
export function firstUserMessage(session: Session): string {
  const msg = session.messages.find((m) => m.role === 'user' && m.kind === 'text');
  return msg?.content ?? session.messages[0]?.content ?? '';
}

export interface SessionTags {
  hasError: boolean;
  hasCode: boolean;
  isLong: boolean;
}

/** 从会话内容推导标签：含错误 / 含代码 / 长会话(>=12 轮) */
export function sessionTags(session: Session): SessionTags {
  const haystack = `${session.title}\n${firstUserMessage(session)}`;
  const hasError = /错误|报错|失败|异常|泄漏|401|500|bug|修复|排查|FOUC|闪烁/i.test(haystack);
  const hasCode = session.messages.some((m) => m.kind === 'code' || m.kind === 'diff');
  const isLong = session.turnCount >= 12;
  return { hasError, hasCode, isLong };
}

/** 卡片底行 mono meta：12 轮 · 18.4k tok · 3 天前 */
export function metaLine(session: Session): string {
  return `${session.turnCount} 轮 · ${formatTokens(session.tokenCount)} tok · ${relativeDate(session.date)}`;
}

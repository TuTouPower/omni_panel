// SessionGrid shared types

export type AgentId = 'claude' | 'grok' | 'opencode' | 'codex' | 'cursor' | 'aider';

export interface Agent {
  id: AgentId;
  name: string;
  /** Agent 识别色 (design.md §2) */
  color: string;
  /** 缩写: CC / GB / OC / CX / CU / AI */
  abbr: string;
  model: string;
}

export type MessageRole = 'user' | 'assistant';
export type MessageKind = 'text' | 'code' | 'tool' | 'diff';

export interface Message {
  id: string;
  role: MessageRole;
  kind: MessageKind;
  /** Markdown 正文 / 代码 / 工具调用描述 / diff 文本 */
  content: string;
  /** HH:mm 时间戳 */
  timestamp: string;
  /** token 估算 */
  tokenEst: number;
  /** 代码块语言（kind === 'code' 时） */
  language?: string;
  /** 工具名（kind === 'tool' 时，如 Read / Edit / Bash） */
  toolName?: string;
}

export interface Session {
  id: string;
  agentId: AgentId;
  title: string;
  filePath: string;
  /** 会话工作目录 */
  cwd: string;
  /** YYYY-MM-DD */
  date: string;
  turnCount: number;
  tokenCount: number;
  messages: Message[];
}

/** 摘选片段（摘选托盘用） */
export interface Segment {
  id: string;
  sessionId: string;
  sessionTitle: string;
  agentId: AgentId;
  message: Message;
}

/** Agent 识别色读取 CSS 变量（index.css :root / .dark 双主题） */
export const AGENTS: Record<AgentId, Agent> = {
  claude: { id: 'claude', name: 'Claude Code', color: 'var(--agent-claude)', abbr: 'CC', model: 'claude-opus-4.6' },
  grok: { id: 'grok', name: 'Grok Build', color: 'var(--agent-grok)', abbr: 'GB', model: 'grok-4-heavy' },
  opencode: { id: 'opencode', name: 'OpenCode', color: 'var(--agent-opencode)', abbr: 'OC', model: 'gpt-5.2' },
  codex: { id: 'codex', name: 'Codex CLI', color: 'var(--agent-codex)', abbr: 'CX', model: 'gpt-5.2-codex' },
  cursor: { id: 'cursor', name: 'Cursor', color: 'var(--agent-cursor)', abbr: 'CU', model: 'composer-1' },
  aider: { id: 'aider', name: 'Aider', color: 'var(--agent-aider)', abbr: 'AI', model: 'deepseek-v3.2' },
};

export const AGENT_LIST: Agent[] = Object.values(AGENTS);

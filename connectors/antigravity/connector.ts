import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { ScriptObservation } from "../../src/shared/types/observation";

declare const ctx: ConnectorContext;

void ctx;

// t362 AC-002: antigravity 为占位 stub（真实 ~/.antigravity/session.json 读取路径
// UNVERIFIED-SPIKE 未确认）。添加后不静默空数据——明确报「暂不支持」，避免误导为可用。
function main(): ScriptObservation[] {
    throw new Error("antigravity 连接器暂不支持（占位 stub，待 spike 确认本地会话格式）");
}

void main;

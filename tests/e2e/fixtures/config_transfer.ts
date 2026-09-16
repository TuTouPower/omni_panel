/**
 * canonical v2 配置传输文档（e2e 共用）。
 *
 * `--config` 导入与 LocalAPI `/v1/config/import` 都只接受该信封（t472 起统一 canonical v2，
 * 裸 AppConfiguration 会被判「不支持的导入文件版本」）。历史 e2e fixture 直接写裸配置，
 * 在 CLI 侧一律启动失败——本 helper 是唯一构造点，避免各处再写错形状。
 */
export function canonical_config_document(
    config: unknown,
    secrets?: Record<string, string>,
): Record<string, unknown> {
    return {
        formatVersion: 2,
        exportedAt: "2026-01-01T00:00:00Z",
        appVersion: "e2e",
        config,
        ...(secrets === undefined ? {} : { secrets }),
    };
}

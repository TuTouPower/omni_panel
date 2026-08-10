# p119 renderer 存量测试 act 警告（settings_form 等）

- 来源：t290 顺手发现（存量）
- 内容：全量 `pnpm test` 有约 80 条「not wrapped in act」警告，来自 settings_form / cpa_connector_settings / provider_card_label_map / label_map_dialog 等 renderer 测试（非 popup_view_height——t290 已修该文件）。单文件运行无警告、全量并行出现，疑似跨用例状态/定时器污染；测试通过但警告掩盖 act 外更新，需逐个文件按 t290 方式（act 包裹等待）清理或定位污染源。
- 处理：t300

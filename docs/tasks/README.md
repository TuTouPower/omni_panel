# Task 清单（待你批复后再实现）

| ID  | 标题                                 | 复杂度 | Spec                                        | Plan                                        | 依赖/备注                                        |
| --- | ------------------------------------ | ------ | ------------------------------------------- | ------------------------------------------- | ------------------------------------------------ |
| T1  | 关闭输入框拼写红波浪线               | S      | [spec](./T1_disable_spellcheck_spec.md)     | [plan](./T1_disable_spellcheck_plan.md)     | 独立                                             |
| T2  | 密钥框小眼睛统一                     | S–M    | [spec](./T2_secret_eye_toggle_spec.md)      | [plan](./T2_secret_eye_toggle_plan.md)      | 与 T3/T4 同批                                    |
| T3  | **已存密钥明文回填 + 等长掩码**      | **L**  | [spec](./T3_secret_mask_length_spec.md)     | [plan](./T3_secret_mask_length_plan.md)     | **改安全模型**：IPC `getSecrets`；更新 blueprint |
| T4  | 眼睛睁/闭（基于真密钥）              | S      | [spec](./T4_secret_reveal_honesty_spec.md)  | [plan](./T4_secret_reveal_honesty_plan.md)  | 依赖 T3                                          |
| T5  | 界面脱敏（隐藏备注，无序号）         | M      | [spec](./T5_ui_desensitize_remarks_spec.md) | [plan](./T5_ui_desensitize_remarks_plan.md) | 独立                                             |
| T6  | 多账号半行间距                       | S      | [spec](./T6_account_row_spacing_spec.md)    | [plan](./T6_account_row_spacing_plan.md)    | 独立                                             |
| T7  | 厂商统一百分比（刷新下、标签映射上） | M      | [spec](./T7_provider_force_percent_spec.md) | [plan](./T7_provider_force_percent_plan.md) | SettingsForm 位置已定                            |
| T8  | 取消主面板编辑按钮                   | S      | [spec](./T8_remove_main_panel_edit_spec.md) | [plan](./T8_remove_main_panel_edit_plan.md) | 独立                                             |

## 已拍板

| 项  | 决定                                                                    |
| --- | ----------------------------------------------------------------------- |
| T3  | **前端必须能回看已存密钥**；打开编辑时 vault→IPC→表单明文；闭眼等长掩码 |
| T4  | 标准睁/闭眼睛；不再「无法回显」                                         |
| T5  | 脱敏后不要序号                                                          |
| T7  | 开关在「跟随全局自动刷新间隔」下、「数据标签映射」上                    |

## 建议实现顺序

1. T1、T6、T8
2. **T3**（IPC + 回填 + 文档改安全模型）→ T2 → T4
3. T5、T7

## 待确认开写

回复 `T1-T8 OK`（或改某条）后开始实现。

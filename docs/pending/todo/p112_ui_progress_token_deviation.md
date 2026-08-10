# p112 ui Progress 尺寸偏离 token 且当前未被消费

- 来源：t283 遗留（DESIGN 视觉对照）
- 内容：`src/renderer/components/ui/Progress.tsx` thin 轨道 h-1（4px）vs token `progress-track` 6px；capsule h-6（24px）vs token `progress-capsule` 22px。Progress 当前未被任何页面消费（组件库交付但无消费方），无运行时影响；待消费方出现时按 token 对齐尺寸。
- 处理：未开

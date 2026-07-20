# Adoption T024

owner 自审（1 case，极小）。

| 项            | decision | rationale                                      | status |
| ------------- | -------- | ---------------------------------------------- | ------ |
| 加 crash case | 采纳     | process.exit vm 内 = throw，显式 case 强化覆盖 | 已修   |

## 处置说明

- runtime.test.ts 加 `process.exit(2)` case：vm sandbox 无 process → ReferenceError → throw → error。
- 13 passed（+1）。

## 遗留问题

- 无。crash 路径在 vm 等效 throw（L145 + 新 case 双覆盖）。

# p182 originalToAlias 先写获胜与后端 resolver 后写覆盖分叉

- 来源：t384 遗留（code reviewer f002）
- 内容：前端 originalToAlias 先写获胜（map 未含时 set），后端 dashboard_alias_resolver 后写覆盖（Map.set 覆盖）。同一 key 出现在多个 alias 组时，prefs 归一（AC-006）可能把 key 归到先声明而非后声明的 alias，使筛选变窄。规范碰撞场景不受影响（每 key 单 alias）。后续统一两侧语义。
- 处理：t428

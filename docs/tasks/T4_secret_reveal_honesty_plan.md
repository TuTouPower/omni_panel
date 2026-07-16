# T4 Plan: 眼睛控件（依赖 T3 明文回填）

## 复杂度

**S**（T3 完成后）

## 实现

1. 随 T2 统一 `SecretInput`（睁/闭）。
2. 无 `configured` 不可回显分支。
3. 加载中：secret 字段可 skeleton / disabled，避免先闪占位再变明文。

## 测试

- 回填后 click eye → type=text 且 value 为 vault 明文。

## Commit

可并入 T2/T3：

```
feat(ui): secret eye toggle works on vault-loaded plaintext
```

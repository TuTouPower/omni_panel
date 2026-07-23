# Task spec

## 背景

t065 I26 遗留：package-and-run 按路径过滤非 image-name。

## 范围

- package-and-run taskkill 按路径（PowerShell Get-Process path）过滤仅 OmniUsage.exe。

## 验收标准

- [ ] 同名 OmniUsage.exe 不误杀；仅杀 artifacts 路径。

## 依赖与约束

- Windows PowerShell 重构。

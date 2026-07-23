# Task spec

## 背景

t063 遗留：task.py mock os.replace 失败路径测试。

## 范围

- Python 单元测试（pytest+monkeypatch）mock os.replace 失败，验证 JSON 不损坏。

## 验收标准

- [ ] mock os.replace 抛错 + JSON 完整（无损坏）；pytest 用例绿。

## 依赖与约束

- 项目无 Python 测试基建，需加 pytest 依赖。

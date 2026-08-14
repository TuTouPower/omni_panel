# p162 parse_cli_json 类型错误分支覆盖可更广

- 来源：t344 遗留（2026-08-13，t344_test_f005 minor）
- 内容：`cli_json_parse.test.ts` 类型错误用例只覆盖 port 字段字符串类型。改进方向：补 url/pid 类型错误（number/string 反置）、userData/startedAt 缺省空串、根节点为数组等边界。
- 处理：未开

# p169 prepareBarDataFromRollup 轴 idxOf 仍线性扫描

- 来源：t349 遗留（2026-08-13，t349_gen_f002 minor）
- 内容：`prepareBarDataFromRollup` 的 session 轴 `ranked.findIndex`（:888）与 project 轴 `dirs.indexOf`（:871）仍线性扫描，未随 prepareBarData 同步改 Map。rollup rows 有界（几百），量级可接受。改进方向：与 prepareBarData 一致改用预构建 Map。
- 处理：t396

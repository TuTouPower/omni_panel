# OmniUsage用量条颜色方案

_Started 2026-06-06 01:58 UTC_

---

## User

请调整 OmniUsage 用量条颜色方案的默认策略。

目前一共有三套颜色方案：

1. 风险色：仅当前用量
2. 风险色：带投影预测
3. 彩色区分：九色循环

默认方案必须是：

```text
风险色：仅当前用量
```

不要把九色循环作为默认。

## 推荐设置项

设置路径：

```text
设置 > 外观 > 用量条颜色方案
```

选项顺序：

```text
风险色：仅当前用量
风险色：带投影预测
彩色区分：九色循环
```

默认选中：

```text
风险色：仅当前用量
```

## 三套方案定位

### 1. 风险色：仅当前用量，默认

这是默认方案。

只根据当前用量比例 `current` 判断颜色。

颜色规则：

```text
绿色：current <= 60%
黄色：current > 60%
橙色：current > 85%
红色：current >= 95%
```

按严重程度判断：

```text
红色 > 橙色 > 黄色 > 绿色
```

也可以写成：

```text
current >= 95%      红色
current > 85%       橙色
current > 60%       黄色
其他                绿色
```

这套方案的优点：

* 逻辑简单
* 用户容易理解
* 不依赖重置时间
* 不依赖窗口开始时间
* 适合余额类、调用次数类、token 类等大多数数据
* 不会因为投影算法导致颜色频繁变化

### 2. 风险色：带投影预测

这是高级风险判断方案。

当用户选择这项时，系统不仅看当前用量，还根据当前使用速度预测到额度窗口结束时可能用掉多少。

计算：

```text
projected = current / elapsed
```

其中：

```text
current = 当前用量比例
elapsed = 已过时间比例
```

颜色规则：

```text
红色：current >= 95% 或 projected >= 100%
橙色：current > 85% 或 projected >= 90%
黄色：current > 60% 或 projected >= 75%
绿色：其他
```

如果无法计算 projected，例如：

* 没有重置时间
* 不知道窗口开始时间
* elapsed 缺失
* elapsed <= 0
* 数据异常

则自动回退到「风险色：仅当前用量」规则。

### 3. 彩色区分：九色循环

这套方案不表达风险，只用于区分不同用量条。

颜色顺序：

```text
1. #5B8CFF
2. #8B72F8
3. #46C7C7
4. #7EA2FF
5. #A18CFF
6. #72D4D1
7. #9CB8FF
8. #B6A7FF
9. #A7D8D8
```

超过 9 条后循环使用：

```text
第 10 条重新使用 #5B8CFF
第 11 条重新使用 #8B72F8
```

这套方案只是视觉区分，不代表安全或危险。

## 重要要求

* 默认必须是「风险色：仅当前用量」。
* 设置项中「风险色：仅当前用量」排在第一位。
* 「风险色：带投影预测」排在第二位。
* 「彩色区分：九色循环」排在第三位。
* 不要默认启用投影预测。
* 不要默认启用九色循环。
* 如果用户没有主动修改设置，所有用量条都按「风险色：仅当前用量」显示。
* 风险色方案只使用绿色、黄色、橙色、红色。
* 九色循环方案不表达风险。

## Assistant

_[tool: list_files]_

I'll start by reading the current file to understand how the color scheme is implemented.I'll explore the relevant files to understand the current color scheme implementation.

_[tool: grep]_

_[tool: grep]_

_[tool: read_file]_

_[tool: read_file]_

Now let me look at the settings files to understand how to add the setting option.

_[tool: read_file]_

_[tool: read_file]_

Now let me look at app.jsx to understand state and how the app wires settings/data.

_[tool: read_file]_

Let me check data.js to understand what data fields are available for projection.

_[tool: grep]_

Let me check the CSS for existing risk/status color variables.

_[tool: update_todos]_

I now understand the full architecture. The bar color is currently always the nine-color cycle via `usageColor(idx)`. I'll implement the three schemes with risk-current as the default. Let me set up my plan.Let me start with components.jsx — the core color logic.

_[tool: str_replace_edit]_

Now thread `elapsed` into the h5/week BarRow calls inside UsageCard, and update the exports. Let me update the account-detail and main bar rows.

_[tool: str_replace_edit]_

Now add `e5, ew` to UsageCard's prop destructure and update the window exports.

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now data.js — add elapsed fractions for the time-window metrics so projection is meaningful.

_[tool: str_replace_edit]_

Now app.jsx — add the barScheme tweak, provide the context, thread elapsed, and update vendorAvg.

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now wire the scheme into SettingsPanel and add a Tweak control in app.jsx.

_[tool: str_replace_edit]_

Now the main deliverable — the setting under 设置 > 外观. Let me update the SettingsPanel signature and add the color-scheme UI.Now insert the setting into the appearance section:

_[tool: str_replace_edit]_

_[tool: read_file]_

Now add the CSS — risk color variables and the setting UI styles.

_[tool: str_replace_edit]_

_[tool: read_file]_

Now the setting UI styles. Let me check the existing set-row styles to match the visual vocabulary.

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Let me update the now-stale comment and verify the build.

_[tool: update_todos]_

_[tool: show_html]_

_[tool: show_html]_

_[tool: save_screenshot]_

_[tool: save_screenshot]_

_[tool: save_screenshot]_

Default is now risk-current (green/yellow risk colors, no nine-color cycle). Let me verify the settings panel and the other two schemes.

_[tool: save_screenshot]_

The setting renders correctly — ordered list, default selected with 默认 badge. Now let me verify the projected and nine-cycle schemes actually change the bars.

_[tool: eval_js]_

Projection works — Codex 一周 (82% avg) is now **red** because projected usage exceeds 100% of the window. Under the default current-only scheme it was yellow. Let me reset the active scheme back to the default so the user lands on it, then confirm nine-cycle too.

_[tool: save_screenshot]_

_[tool: eval_js]_

All three schemes verified working: current-only (default), projected (Codex turns red from pace), and nine-cycle (blue/purple/teal). Let me reset the persisted state back to the default so the user lands on it.

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: update_todos]_

Everything works. The persisted tweak is back to the default. Now let me hand off via `done`.

_[tool: done]_

_[tool: fork_verifier_agent]_

完成。已把用量条颜色方案的默认策略改为「风险色：仅当前用量」。

**设置位置:** 设置 > 外观 > 用量条颜色方案,三项按要求排序:
1. 风险色:仅当前用量(带「默认」徽标,默认选中)
2. 风险色:带投影预测
3. 彩色区分:九色循环

**取色逻辑:**
- **仅当前用量(默认):** 只看 `current`,按 红≥95% > 橙>85% > 黄>60% > 绿 判断,不依赖重置/窗口时间。
- **带投影预测:** 在当前用量基础上算 `projected = current/elapsed`,红(≥95% 或预测满额)、橙、黄分级;无法计算(无重置时间/窗口起点/elapsed≤0)时自动回退到「仅当前用量」。
- **九色循环:** 按用量条顺序循环九色,纯视觉区分,不表达风险,第 10 条起复用。

未改动设置时所有用量条均按「仅当前用量」显示。可在设置或 Tweaks 面板切换三套方案;代码默认值即 `risk-current`,绝不默认九色循环。

注:为让「带投影预测」可演示,我给时间窗口型指标补了已过时间比例数据——比如 Codex 一周按当前速度会超额,投影方案下显示红色,而默认方案显示黄色。


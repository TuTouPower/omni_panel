# p267 花云多服务账号只反映第一个服务的用量

- 现象：`connectors/flowercloud/connector.ts` 的 `extract_from_html` 与 `flower_product_details_id`（现位于 `src/main/core/session/flowercloud_dom.ts`）都只取页面里第一个 `productdetails&id=` 或第一组用量数字，账号下若有多台服务/多个产品，面板只显示其中一个的用量。
- 影响：花云单实例多服务用户的用量与状态可能偏低（只统计首个服务），且账号标签取自首个产品的 `product_name`，用户无法察觉其余服务被漏算；`account_id` 固定为 `flowercloud_default`，前端也无法区分。
- 根因：会话 DOM 快照只保留一张用量页 HTML，连接器只输出一条 observation。作用域是「一个实例一个产品」的假设，从 t533 引入连接器时就存在，8b15016d 的 DOM 快照改动沿用了同一假设。已扫：`connectors/flowercloud/connector.ts`（单一 `obs`）、`src/main/core/session/flowercloud_dom.ts`（`flower_product_details_id` 取首个匹配、`flower_snapshot_url` 同样只认首个 id），两处同类。
- 测试缺口：`tests/integration/connector/flowercloud_connector.test.ts` 的 fixture 只有单个产品页，无法暴露；需要新增多产品 HTML fixture，并断言每个服务各出一条 observation（或明确记录「只支持单服务」的产品决定）。
- 线索：无。需先取一个多服务账号的真实客户区页面（或按 WHMCS 客户区结构构造 fixture）。
- 处理：未开。2026-09-29 已加最小可感知措施——连接器在页面出现 >1 个服务时记 `warn`（`tests/integration/connector/flowercloud_connector.test.ts` 覆盖），并在 `docs/specs/flowercloud_usage.md` 声明「只统计首个服务」。多 observation 支持待排期。

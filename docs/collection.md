# 后台更新与 QQ 接口

站点身份：`appgprj_6ad79acbe8f081919d3255fd4dfa3495`。复用 `.openai/hosting.json`，不要重新创建同名站点。部署和计划是否成功，以 Sites 原生返回为准。

## 更新操作

仅从公开 tarkov.dev 数据读取，服务器写入本站公共行情和收益档案；不接受外部 URL、不接游戏账号、不写个人设置。

依次请求已发布站点以下路径，检查 HTTP 成功且 `warning` 为空：

```text
GET /api/collect?market=pve
GET /api/collect?market=regular
GET /api/collect?market=pvp-season
```

然后分别读取 `/api/snapshot?market=...` 和 `/api/ledger?market=...`，核对市场、采集时间与当天档案 `updatedAt`。`/api/health` 只能证明服务响应，不能证明采集成功。

成功快照缓存 5 分钟、历史点缓存 30 分钟。收益每天汇总、每小时最多记一次；重复触发不重复计数。记录包含亏损，配方与费率版本变化时隔离。R2 条件写入重试避免覆盖并发记录。错误保留成功数据，下一次运行可重试，不把旧结果改成新时间。

前台每 5 分钟检查。本地服务进程每 5 分钟采集；托管无人值守运行需要 Sites 已保存且启用的计划，初始每小时采集。例行更新只写数据，不重新部署。计划创建不能代替一次真实更新与读取验证。

公开站点的固定公共行情路径可匿名请求。如果以后改为私有，需要重新验证任务的原生服务访问，不能仅为了采集而修改网站受众。文档不存放任何凭证。

## QQ 适配契约

```text
GET /api/feed?market=pve
GET /api/feed?market=regular
GET /api/feed?market=pvp-season
```

返回 `version`、`market`、`generatedAt`、`source`、`items`、文本 `text`。条目包含物品、路线类型、利润、成本、报价时间、解锁条件和物品链接。`basis: before-fuel` 表示未扣燃料。

摘要只使用有效近期报价。条件字段是执行要求，不代表已经解锁。没有机会可以返回空列表，不拿旧报价或演示值补满。

接口不会发送消息。后续在确认机器人与目标群权限后，由适配器实现订阅、最低利润、静默时段、按市场与路线去重、过期丢弃和失败退避。

# 数据来源与可行性核验

核验日期：2026 年 10 月 20 日。以下区分实际读取结果与仍需验证的限制，避免将第三方行情数据当成游戏成交记录。

## 用户提供的中文 Wiki

参考页面：[单格价值排行](https://www.eftarkov.com/ranking?mode=pve&category=all)。

直接读取页面 HTML 成功。排行榜以服务端生成的内容返回，页面脚本、链接和页脚未发现明确的上游数据提供方声明。相关[制作利润页面](https://www.eftarkov.com/fabrication?mode=pve)包含材料成本、出售价格、手续费和实际利润列；其加载更多请求指向本站 `/fabrication` 路由。

目前只能证实浏览器使用该网站自己的服务端输出，不能据此确认网站后端从 tarkov.dev、Tarkov Market 或自建采集取得数据。相同的游戏物品 ID 不能证明两站共用同一数据源。

因此，新应用参考其功能，但数据接入直接选择已验证的公开接口。若未来得到该站明确的来源说明，可补充结论。

## tarkov.dev

来源是社区项目，并非 Battlestate Games 的官方成交接口。[项目说明](https://github.com/the-hideout/tarkov-api)列出物品价格、交易、藏身处配方等能力。

直接请求 [JSON 接口目录](https://json.tarkov.dev/endpoints)成功，返回：

| 市场代码 | 本应用显示 |
| --- | --- |
| `pve` | PVE |
| `regular` | PVP 常规 |
| `pvp-season` | PVP 赛季 |

接口目录同时提供物品、兑换、制作、藏身处、商人、任务及单物品历史价格；支持 `zh` 语言。原始物品集合的名称字段是翻译键，正式应用必须处理对应翻译，不可直接显示键值。

本次读取结果：

- 三个市场的 `items` 均成功返回，PVE 物品集合为 5,480 条。该数量包含不能正常交易或获取的对象，不等于可推荐物品数。
- PVE `barters` 返回 855 条兑换配方，`crafts` 返回 214 条制作配方。
- PVE LEDX 样本有占格、基础价、当前低价、24 小时均价、报价数量、商人收购、更新时间和逐物品跳蚤等级条件。
- [PVE LEDX 历史接口](https://json.tarkov.dev/pve/prices/5c0530ee86f774697952d952)成功返回 963 个历史点，包含 `price`、`priceMin`、时间戳，近期点含 `offerCount`；不同历史区间粒度不同。
- 兑换含商人等级、限购、材料及任务解锁；制作含耗时、设施等级、产出数量及 `tool` 标记。

这些字段可以支持单格价值、兑换与制作计算。它们不能直接提供用户真实剩余库存、实际成交速度或完整活动可获取性。

当前读取的三个市场配置均为 `foundInRaidRequired: false`、全局跳蚤等级 15、两项手续费参数各为 0.05。LEDX 另有物品级条件 35，说明不能只检查全局等级。以上是本次接口状态，不应永久写死，实际游戏变更需重新核验。

手续费应参照[数据提供方前端的实现](https://github.com/the-hideout/tarkov-dev/blob/main/src/modules/flea-market-fee.mjs)，同时读取最新参数。源码中的兜底常量和当次数据参数可能不同，不能照抄兜底值作为现行规则；正式版需用游戏挂单界面的实例验证数量、减免和舍入。

价格的逐项 `lastScan` 应用于新鲜度判断。历史 `offerCount` 是报价观测，不能作为销量。建议按市场自建快照，保存成本和规则版本，才能分析可复核的历史净利润。

## Tarkov Market 备选

[提供方 API 文档](https://tarkov-market.com/dev/api)说明需要 Pro 资格，提供 PVE、PVP 和赛季，完整列表缓存 5 分钟。其条款要求公开项目标注来源，并保留对大幅复制其功能的项目终止访问的权利。

本项目拟公开提供相近的经济分析功能，因此不把该付费服务作为默认依赖；若未来需要其数据，先明确使用条件和费用。未开通任何付费服务。

## QQ

[QQ 官方消息文档](https://github.com/tencent-connect/bot-docs/blob/main/docs/develop/api-v2/server-inter/message/send-receive/send.md)包含主动推送政策调整提示；[较新的官方 Node SDK 使用说明](https://github.com/tencent-connect/qqbot-nodejs/blob/main/USAGE.md)仍描述受平台额度约束的主动发送。

文档存在时间和适用范围差异，不能仅据 SDK 方法存在就承诺账号具备主动群发权限。用户当前选择先预留接口，因此后续按实际机器人类型、账号权限与目标群完成验证，再决定查询、摘要与提醒的具体接法。

## 实施时优先补齐

- 活动限定、常规刷新与不可获取物品的可维护分类及出处。
- 手续费与游戏挂单实例的一致性，以及各市场和角色条件。
- API 访问策略、数据与素材署名、结构变更检测及国内访问表现。
- 历史配方、商人价格、燃料和手续费版本；缺失区间不得称为精确历史利润。
- 市场最低扫描价与可执行买入成本的差异，以及异常低价、高价的过滤。

## 交互预览素材与示例

三列预览使用实际物品、商人和设施图标。素材由以下公开仓库的固定版本经 jsDelivr 直接引用：

- [Tarkov Raid Items](https://github.com/fakundo/tarkov-raid-items)：版本 `970988a8e0ce3dd9389e438f4adafbb64a7c78ae`，物品图片；提供方说明来自游戏图标缓存。
- [RatScanner / EfTIcons](https://github.com/RatScanner/EfTIcons)：版本 `b2ae54d5d63441f1623ecd1c7e8087a516af3881`，白糖、液晶屏、材料等物品图片。
- [Tarkynator](https://github.com/emilanderss0n/tarkynator)：版本 `2b7ac63aa8af0de2b78dddbc83f1b7b641178630`，滤芯和应急饮用水图片。
- [tarkov.dev 前端](https://github.com/the-hideout/tarkov-dev)：版本 `ec44177bd3c21aa2b33938153acd0a96dbd939aa`，商人头像和设施图片。

兑换、制作材料和设施等级依据已读取的 PVE 配方示例；挂牌价、手续费、成本、历史涨幅和稳定性是演示值。市场切换中的金额变化也是交互演示，不是三个市场的真实比较。预览不请求实时价格、不生成虚构刷新时间。图像和游戏内容属于各自权利人；正式公开版需核验当前素材、署名与使用条件。

# 前端工程交付评审

评审时间：2026-10-23。基线：`d4a70ca`，包含工作区相对 HEAD 的修改，以及新增 `archive.css`、`archive-crafts.css`、`archive-details.css`、`workshop-field.svg`。

结论：本地源资源与带指纹资源链路一致，未发现新增的前端构建阻断项；发布打包白名单漏掉了本轮新增的独立图片资源，需要在准备发布包前修复。另有样式层叠与交付检查方面的维护建议，不应当与当前运行故障混为一谈。

## 已确认缺陷

### P2：腾讯云发布包漏掉工位背景 SVG

- 引用位置：[app/archive-crafts.css:195](C:/Users/ASUS/Documents/Codex/2026-10-20/new-chat/outputs/tarkov-profit-radar/app/archive-crafts.css:195)。工位背景使用独立的 `/workshop-field.svg` URL。
- 路由位置：[app/server.mjs:30](C:/Users/ASUS/Documents/Codex/2026-10-20/new-chat/outputs/tarkov-profit-radar/app/server.mjs:30)。该 URL 读取发布目录内 `public/workshop-field.svg`。
- 遗漏位置：[scripts/package-tencent.mjs:21](C:/Users/ASUS/Documents/Codex/2026-10-20/new-chat/outputs/tarkov-profit-radar/scripts/package-tencent.mjs:21)。显式发布白名单只有原来的 `favicon.svg`、`fence.webp` 等资源，未包含新 SVG；之后只追加压缩 JS/CSS 与 manifest。
- 构建证据：[scripts/build-client.mjs:17](C:/Users/ASUS/Documents/Codex/2026-10-20/new-chat/outputs/tarkov-profit-radar/scripts/build-client.mjs:17) 只是合并与压缩 CSS，不会把 CSS 的 `url()` 图片内联或加入发布白名单。`npm run build` 使用的托管构建会复制 public 文件，不能证明腾讯云压缩包的内容完整。
- 影响：通过现有 `package-tencent.mjs` 或 `package-update.mjs` 交付时，藏身处主卡工位背景丢失。映射文件缺失会在 [app/http-server.mjs:81](C:/Users/ASUS/Documents/Codex/2026-10-20/new-chat/outputs/tarkov-profit-radar/app/http-server.mjs:81) 抛出 ENOENT，并由第 113 行返回 HTTP 500。行情、金额和制作功能不受影响。
- 建议：将 SVG 加入发布白名单；同时补入新 3 份源 CSS，使文档中的 `CLIENT_BUNDLE=0` 模式有完整资源。发布前检查压缩包清单及其中 CSS 的同源图片依赖。
- 边界：这是根据明确的白名单与路由做出的静态结论，本次没有生成或部署发布包。原来 `terminal.css`、`ui-motion.mjs` 未加入该白名单的问题已存在于 HEAD，属于同一打包机制的既存遗漏，不算作本轮新引入。

## 维护建议与验证盲区

### P3：同一组件仍跨 3 层样式维护，后续修正容易改到被覆盖的规则

- 证据：[app/terminal.css:297](C:/Users/ASUS/Documents/Codex/2026-10-20/new-chat/outputs/tarkov-profit-radar/app/terminal.css:297) 保留了完整的旧制作卡布局与 1151 / 1150 / 700 / 370px 规则；[app/archive-crafts.css:3](C:/Users/ASUS/Documents/Codex/2026-10-20/new-chat/outputs/tarkov-profit-radar/app/archive-crafts.css:3) 又定义当前制作卡布局和 1600 / 900 / 700 / 370px 规则。普通卡同样在 `style.css`、`terminal.css`、`archive.css` 中重复定义。
- 当前状态：新样式加载顺序正确，高优先级选择器覆盖旧布局；没有仅凭重复规则认定屏幕上的布局错误。
- 风险：维护者可能修改旧的 `craft-feature` 规则却看不到效果；移除一层时，又可能丢掉仍从旧层继承的 `display:flex`、字族等基础属性。
- 建议：在设计验收完成后，按组件合并当前有效规则，明确基础层与组件层的职责；清理前对关键断点做截图对比。此项可后续处理，不建议在本轮评审时贸然大规模清理。
- 文档同步：[docs/frontend-handoff.md:40](C:/Users/ASUS/Documents/Codex/2026-10-20/new-chat/outputs/tarkov-profit-radar/docs/frontend-handoff.md:40) 仍将 `terminal.css` 称为“最后加载”，与第 159 行描述的新顺序矛盾；应以 `archive-details.css` 为最后一层并列出新增文件。

### P3：现有自动测试没有验证发布包的资源闭环

- [app/client-assets.test.mjs:12](C:/Users/ASUS/Documents/Codex/2026-10-20/new-chat/outputs/tarkov-profit-radar/app/client-assets.test.mjs:12) 使用合成 HTML 与合成 CSS，能验证链接替换和 checksum，但不能发现真实 CSS 引用的 SVG 漏打包。
- [scripts/check-deployment.mjs:44](C:/Users/ASUS/Documents/Codex/2026-10-20/new-chat/outputs/tarkov-profit-radar/scripts/check-deployment.mjs:44) 的资源清单也未加入新 SVG 与新样式；只检查指纹 CSS 返回成功，仍无法发现 CSS 依赖失败。
- 建议优先补一项有实际价值的交付检查：从页面样式与脚本入口遍历同源静态依赖，或至少用统一资源清单驱动服务器映射、构建与发布白名单。不要为纯装饰规则逐条编写镜像测试。
- 另一个已有边界：[app/quicklook.test.mjs:37](C:/Users/ASUS/Documents/Codex/2026-10-20/new-chat/outputs/tarkov-profit-radar/app/quicklook.test.mjs:37) 验证“传入旧 plan 保持位置、无旧 plan 使用新排序”，但不直接执行 [app/app.js:394](C:/Users/ASUS/Documents/Codex/2026-10-20/new-chat/outputs/tarkov-profit-radar/app/app.js:394) 的行情应用与清空 plan 流程。当前代码确实清空了 plan，没有发现功能缺陷；最终人工验收应保留一次行情应用后自动重排的检查。

## 已核对内容

- 源 HTML、Node 静态路由、静态资源准备、客户端压缩合并、指纹 HTML 替换均包含新增 3 份样式，顺序一致：`radar → community → accounts → terminal → archive → archive-crafts → archive-details`。
- 托管入口 `app/route.ts` 直接使用源 HTML；`prepare-assets.mjs` 将新增样式复制到 public；工位 SVG 本身位于 public，因此这条构建路径没有对应遗漏。
- 本地只读 HTTP 检查：8791 指纹 CSS 与 SVG 均返回 200；8792 的 7 份源样式与 SVG 均返回 200。CSS MIME 为 `text/css`，SVG MIME 为 `image/svg+xml`。
- 本地指纹 CSS 约 204 KB（未计压缩传输），本轮新增 3 份源 CSS 合计 47,261 字节，工位 SVG 2,146 字节。该数据用于说明量级，不作为缺陷；用户已允许视觉优先。
- 新增样式主要为渐变、静态切角、图片阴影及短暂 hover 反馈。没有新增持续动画、全屏动态模糊或网络轮询。动效管理仍清理已完成的 Web Animations，并沿用减少动效的全局规则。
- `.card-main` 已使用 `flex:1 0 auto`，图片有明确网格轨道与 contain 约束；没有从本轮改动中发现再次引入先前卡片坍缩或图片 130% 放大的规则。
- 页面切换克隆使用 `.scene-out` 时，新制作卡与云图选择器同时覆盖克隆区域，避免仅依赖原列表 ID 造成过渡时样式丢失。
- 新 SVG 无脚本、外部资源引用或 `foreignObject`；未发现新增外部字体 / CDN 依赖。

## 覆盖边界

本代理进行了只读代码、差异、资源引用和本地静态 HTTP 审查，仅新增本评审文档。未读取私密数据库或凭证，未修改实现，未提交或推送，未生成发布包，未执行真实部署。完整测试、客户端构建、托管构建由主代理统一执行；本报告不重复宣称其结果。浏览器视觉比例、实际交互、无障碍和多市场功能回归由其他评审分工及主代理汇总。

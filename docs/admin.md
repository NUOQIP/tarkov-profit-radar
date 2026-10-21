# 管理端

腾讯云 / 本机 Node 服务的入口为 `/admin/`。管理入口不放进玩家导航，不提供公开注册。Sites 托管预览不提供管理端。

## 物品分类

- 搜索中文名、英文名或物品 ID，支持活动物品和已修改筛选。
- **活动分类**：跟随原始分类 / 活动物品 / 非活动物品。
- **稀有度**：跟随原始分类 / 常见 / 稀有 / 超稀有 / 未收录。
- 修改同时用于三个市场；活动分类影响玩家的活动开关，稀有度影响跑刀优先级。
- 基础武器的调整由其预设继承；预设自身的调整优先。货币不会因取消活动标记进入可拾取列表。
- 恢复原始分类只清除人工调整，行情采集不会覆盖人工设置。

保存后新的看板请求会使用新分类。已打开的玩家页面会在下一次5分钟检查时收到更新，也可手动刷新。维护信息提供上游检查状态和最近修改记录，仅登录后可见。

## 设置密码

在服务器的 Bash 终端执行，密码不会写进命令历史或运行日志：

```sh
read -rsp 'New administrator password: ' radar_password; echo
printf '%s' "$radar_password" | sudo -u tarkov-radar /opt/tarkov-radar/node/bin/node \
  /opt/tarkov-radar/current/scripts/admin-password.mjs /var/lib/tarkov-radar/admin/credentials.json
unset radar_password
```

密码至少12个字符，建议使用密码管理器生成。修改密码后原有登录会失效。没有设置密码时，登录与修改功能关闭，玩家网站照常运行。

本机使用 `node scripts/admin-password.mjs`，同样从标准输入传入密码，默认保存至 `.cache/v2/admin/credentials.json`。不要将密码作为命令参数或写进仓库。

## 访问与保存

- 公网后台只接受 HTTPS；本机与 SSH 本机转发可以使用 HTTP。
- 登录8小时有效，服务重启后需重新登录。登录限速、同源校验和 CSRF 验证保护修改接口。
- `DATA_DIR/admin/item-overrides.json` 保存分类及最近200条修改记录。
- `DATA_DIR/admin/credentials.json` 只保存加盐密码摘要。
- 腾讯云安装器保留整个数据目录，每天备份人工分类、密码摘要与已结束日期的收益档案，保留约14天。
- 恢复时先备份当前数据，停止服务，恢复确认过的 JSON 文件并设置所有者为 `tarkov-radar`，再启动服务。不要直接覆盖仍在写入的数据。

反向代理必须覆盖 `X-Real-IP` 和 `X-Forwarded-Proto`。服务只监听 `127.0.0.1`，不要公开8787端口。`ADMIN_ORIGIN` 可固定公开管理源地址；`ADMIN_CREDENTIAL_FILE` 可指定其他密码摘要文件。

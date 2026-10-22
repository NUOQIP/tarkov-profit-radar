# 管理端

正式入口：**[后台管理](https://101.33.32.33/admin/)**。腾讯云 / 本机 Node 服务的路径为 `/admin/`。管理入口不放进玩家导航，管理员账号不开放注册。Sites 托管预览不提供管理端。

## 物品分类

管理端另有「邮箱」页签，用于配置玩家登录验证码的发信服务、保存授权码并检查连接。操作步骤见 [账号与邮箱](accounts.md)；授权码不会在接口读取结果中返回。

- 搜索中文名、英文名或物品 ID，支持活动物品和已修改筛选。
- **活动分类**：跟随原始分类 / 活动物品 / 非活动物品。
- **稀有度**：跟随原始分类 / 常见 / 稀有 / 超稀有 / 未收录。
- 修改同时用于三个市场；活动分类影响玩家的活动开关，稀有度影响跑刀优先级。
- 基础武器的调整由其预设继承；预设自身的调整优先。货币不会因取消活动标记进入可拾取列表。
- 恢复原始分类只清除人工调整，行情采集不会覆盖人工设置。

保存后新的看板请求会使用新分类。已打开的玩家页面会在下一次5分钟检查时收到更新，也可手动刷新。维护信息提供上游检查状态和最近修改记录，仅登录后可见。

## 评论管理

登录后切换「评论」，按物品、昵称或正文搜索。隐藏后玩家页面不再显示，点击「恢复」可重新展示；不提供公开删除接口。

评论按物品归档，保留发布市场。发布需验证邮箱并登录，昵称来自玩家账号；历史匿名评论继续保留。接口限制字数、重复发布和发布频率。评论数据库位于 `DATA_DIR/community/comments.sqlite`，使用 SQLite，无需另装数据库服务。

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
- `DATA_DIR/admin/mail.json` 保存发信配置与 SMTP 授权码，不对外提供下载。
- `DATA_DIR/community/comments.sqlite` 保存评论及管理状态；WAL 辅助文件由 SQLite 管理。
- `DATA_DIR/community/accounts.sqlite` 保存玩家账号、条件与会话摘要。
- 腾讯云安装器保留整个数据目录，每天备份管理配置、账号、评论与已结束日期的收益档案，保留约14天。管理备份含 SMTP 授权码，须私下保管。
- 恢复时先备份当前数据，停止服务，恢复确认过的 JSON 文件并设置所有者为 `tarkov-radar`，再启动服务。不要直接覆盖仍在写入的数据。

单独备份评论可运行 `node scripts/backup-comments.mjs <数据库路径> <备份路径>`，使用 SQLite 在线备份以包含 WAL 中已提交的评论。恢复评论时停止服务，先保存原库与辅助文件，再用备份替换数据库；旧的 `-wal`、`-shm` 文件不能与恢复后的库混用。

反向代理必须覆盖 `X-Real-IP` 和 `X-Forwarded-Proto`。服务只监听 `127.0.0.1`，不要公开8787端口。`ADMIN_ORIGIN` 可固定公开管理源地址；`ADMIN_CREDENTIAL_FILE` 可指定其他密码摘要文件。

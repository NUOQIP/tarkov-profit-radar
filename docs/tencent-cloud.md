# 腾讯云香港部署

公测入口：**[塔科夫赚钱监控](https://tarkovlootradar.lanluz.xin/)**，管理入口为 **[/admin/](https://tarkovlootradar.lanluz.xin/admin/)**。

使用轻量应用服务器运行 Node 服务和 Nginx，无需另购数据库。现有 Sites 预览与腾讯云数据独立，正式访问以上述入口为准。

新迭代先在本机预览，检查确认后再上传发布。评论使用 Node 24 内置 SQLite，数据留在 `/var/lib/tarkov-radar/community/`；图片缓存位于数据目录的 `media/`，可重新生成。生产打包会生成压缩、带内容版本的客户端资源，自动使用一年缓存；入口 HTML 每次验证，发布后自动取得新资源。

## 现有实例更新

本机执行 `node scripts/package-update.mjs 20261023`，把生成的更新包上传到 `/home/ubuntu`，按包内「执行说明.txt」操作。更新器检查包、备份数据、切换程序并验证账号与资源，失败恢复原程序。账号、会话、评论、邮件配置、图片缓存和现有 Nginx 域名配置由服务器保留；更新包不含私密数据。

域名通过 Cloudflare 代理，SSL/TLS 使用完全（严格）。Nginx 的域名站点只信任 Cloudflare 官方网段的真实 IP 头，避免玩家共用同一个限流计数。域名证书使用 `/etc/letsencrypt/live/radar-domain/`，自动续期已验证。需要重新配置时使用 `deploy/tencent/setup-domain.sh`。

## 本次试用配置

| 项目 | 选择 |
| --- | --- |
| 地域 | 中国香港 |
| 套餐 | 中国香港入门型，2核2GB / 40GB SSD / 20Mbps / 0.5TB月流量 |
| 系统 | 纯操作系统 → Ubuntu 24.04 LTS，x86_64 |
| 时长 | 1个月，1台，不开启自动续费 |
| 增值服务 | 不选共享存储、控制面板、额外数据库 |
| 服务端 | Node 24 LTS + Nginx + systemd |

2026-10-22 登录后的购买页显示 **38元/月**，常规年费456元，域名另计。先试一个月，后续是否续费按测试结果决定。以订单金额为准；月流量用完后可能产生额外流量费，应设置费用和流量提醒。[价格与流量费](https://cloud.tencent.com/document/product/1207/73452)

香港节点通常无需中国内地 ICP 备案。腾讯云提示此入门套餐不保证内地跨境网络质量，应从实际玩家网络测试网页与图片加载。[使用限制](https://cloud.tencent.com/document/product/1207/44376/)

## 打包和安装

本地运行：

```sh
node scripts/package-tencent.mjs
```

生成 `outputs/tarkov-radar-tencent.tar.gz` 及 `.sha256`。包内只包含运行文件、部署配置和核验脚本；不包含账号、密钥、行情缓存或 Git 元数据。

使用控制台提供的 SSH 登录方式连接实例。密码、验证码和私钥不要写进仓库或聊天。首次连接核对主机指纹。将以下命令的 `SERVER_IP` 替换为该实例公网 IP；使用密钥时按自己的 SSH 配置连接：

```sh
scp outputs/tarkov-radar-tencent.tar.gz outputs/tarkov-radar-tencent.tar.gz.sha256 ubuntu@SERVER_IP:~
ssh ubuntu@SERVER_IP
sha256sum -c tarkov-radar-tencent.tar.gz.sha256
mkdir -p ~/tarkov-release
tar -xzf ~/tarkov-radar-tencent.tar.gz -C ~/tarkov-release
sudo bash ~/tarkov-release/deploy/tencent/install.sh
```

安装器仅支持全新、专用的 Ubuntu 24.04 x86_64 实例。它会校验包内文件、从 Node 官方下载并校验运行时、创建低权限服务用户、启用开机启动和每日备份。代码在 `/opt/tarkov-radar/releases/`，数据在 `/var/lib/tarkov-radar/`，升级不覆盖数据。首次安装保持网站仅本机可见。

## 验证后开放试用

先在服务器检查；初次抓取三个市场可能需要几分钟，未完成时不要发布：

```sh
sudo journalctl -u tarkov-radar -n 40 --no-pager
/opt/tarkov-radar/node/bin/node /opt/tarkov-radar/current/scripts/check-deployment.mjs http://127.0.0.1:8080
```

核验三个市场、快照新鲜度、标签与档案、压缩和条件缓存、静态文件、QQ接口关闭状态。历史标签随后台扫描逐步积累，缺历史不会补造。

本机通过 SSH 转发看页面，不需要开放额外网站端口：

```sh
ssh -N -L 18787:127.0.0.1:8080 ubuntu@SERVER_IP
```

浏览器打开 `http://127.0.0.1:18787/`。确认主页面、三个市场、物品明细与走势图正常。这个窗口关闭就停止转发，服务器继续运行。

先用公网 IP 做 HTTP 连通测试。以下只用于新建的专用实例；先确认 `/etc/nginx/sites-enabled/default` 是系统默认站点链接，再取消该链接：

```sh
ls -l /etc/nginx/sites-enabled/default
sudo unlink /etc/nginx/sites-enabled/default
sudo cp /etc/nginx/sites-available/tarkov-radar /etc/nginx/tarkov-radar.before-public.conf
sudo install -m 0644 /opt/tarkov-radar/current/deploy/tencent/nginx-http.conf.example /etc/nginx/sites-available/tarkov-radar
sudo nginx -t
sudo systemctl reload nginx
```

在腾讯云防火墙放行网站 TCP 80 / 443；SSH 22 仅允许管理者来源地址，**不开放8787和8080**。若系统启用了 UFW，也只添加对应规则，不要直接关闭防火墙。此时访问 `http://SERVER_IP/` 做连通检查，公网后台在 HTTP 下禁止登录。

## HTTPS 与管理端

没有域名也可申请公网 IP 证书。Let's Encrypt 的 IP 证书有效期6天，Certbot 5.4+ 支持 webroot 验证，必须启用自动续期及 Nginx 重新载入钩子。[官方说明](https://letsencrypt.org/2026/03/11/shorter-certs-certbot)

按 [Certbot 官方安装说明](https://certbot.eff.org/instructions?ws=other&os=snap) 安装 Snap 版本，核实版本后申请。以下 `SERVER_IP` 必须替换为已核对的公网 IP；申请命令接受证书服务条款，不登记联系邮箱：

```sh
sudo snap install --classic certbot
/snap/bin/certbot --version
sudo mkdir -p /var/www/tarkov-acme
sudo /snap/bin/certbot certonly --non-interactive --agree-tos --register-unsafely-without-email \
  --preferred-profile shortlived --webroot --webroot-path /var/www/tarkov-acme \
  --ip-address SERVER_IP --cert-name radar-ip
sudo install -m 0755 /opt/tarkov-radar/current/deploy/tencent/renew-hook.sh \
  /etc/letsencrypt/renewal-hooks/deploy/radar-nginx
```

证书成功签发后，将 `nginx-ip-https.conf.example` 中的 `SERVER_IP` 替换为实际 IP，备份并替换网站配置，运行 `nginx -t` 再重新加载。验证 `https://SERVER_IP/` 证书受信任、HTTP 自动跳转以及 `/admin/` 可以登录。不可绕过证书错误。

```sh
sudo /snap/bin/certbot renew --dry-run
systemctl list-timers --all | grep certbot
```

确认续期任务有效后，在服务器设置管理员密码，详见 [后台说明](admin.md)。管理员分类保存在数据目录中，不随新版本替换。日后有域名可改用 `nginx-public.conf.example` 和对应证书。

从实际玩家的宽带和手机网络打开网站，检查首次加载、刷新、图标加载与详情图表；核验脚本也可在本机对公网地址执行。2GB配置是试用起点，承载人数以实测为准。

## 旧数据迁移

没有迁移也能重新采集行情，但收益档案需要重新积累。需要保留本机档案时，短暂停止旧采集进程，归档 `.cache/v2/ledger/` 后立即恢复旧服务；不要复制半写入文件或覆盖正在写入的新库。

把归档上传到服务器，停止 `tarkov-radar`，先备份服务器已有数据，再在空目录中恢复档案，设置所有者为 `tarkov-radar:tarkov-radar`，最后启动服务。若服务器已有重叠日期数据，应先比较并合并，不整目录覆盖。Sites 的 R2 数据与本机档案分开，不能把本机备份当成 R2 备份。

## 运维

| 目的 | 命令 / 位置 |
| --- | --- |
| 服务状态 | `sudo systemctl status tarkov-radar` |
| 运行日志 | `sudo journalctl -u tarkov-radar -n 100 --no-pager` |
| 重启服务 | `sudo systemctl restart tarkov-radar` |
| 备份计划 | `systemctl list-timers tarkov-radar-backup.timer` |
| 收益备份 | `/var/backups/tarkov-radar/ledger-*.tar.gz` |
| 分类与密码摘要备份 | `/var/backups/tarkov-radar/admin-*.tar.gz` |
| 评论备份 | `/var/backups/tarkov-radar/comments-*.sqlite` |
| 账号与条件备份 | `/var/backups/tarkov-radar/accounts-*.sqlite` |
| 当前版本 | `/opt/tarkov-radar/current/RELEASE.json` |

每天01:15 UTC（北京时间09:15）附近备份已结束日期的收益档案、管理员配置、账号与评论，保留约14天；当日收益档案在次日纳入。账号和评论通过 SQLite 在线备份保存，包含 WAL 已提交数据。同盘备份只能应对误改，需定期把备份下载到本机；退订或销毁服务器前先保存数据。管理备份包含 SMTP 授权码，应私下保管。

升级：上传新包，解压到新的目录，再运行安装器。它会切换版本并做存活检查，失败时回退已有旧版本；随后仍要执行完整核验。若存活正常但业务有问题，停止服务，将 `current` 链接切回 `/opt/tarkov-radar/releases/` 中核实过的旧版本，重启后再次核验。安装器保留已有 Nginx 网站配置。

首次升级账号功能时，将现有 `/etc/nginx/sites-available/tarkov-radar` 中的 `client_max_body_size` 从 `8k` 调整为 `512k`，执行 `sudo nginx -t` 通过后再重新加载 Nginx。完整的玩家条件可能超过8KB；应用仍独立限制登录、评论等小请求与账号设置请求的大小。新安装模板已包含此调整。

关注内存、磁盘、采集失败率、接口响应时间和公网出流量。套餐不自动续费不等于阻止所有流量费；试用到期前决定续费、迁移或停止并释放实例。

## 当前验证范围

2026-10-22 完成腾讯云香港部署：Ubuntu 24.04.4、Node 24.22.1、Nginx，迁入三个市场的行情缓存与历史记录。已从公网通过 HTTPS 核验三个市场（各5480件物品）、静态资源、压缩与条件缓存、后台登录与退出、未登录访问限制。

已核验开机自启、低权限运行、每日备份、IP证书及自动续期计时器；证书续期演练和 Nginx 重新载入钩子通过。后台分类编辑已在公网验证保存到磁盘、同步三个市场和恢复原始分类；本机测试另覆盖CSRF和并发冲突。实例初始内存占用约443MB，实际并发承载量仍需随公测观察。

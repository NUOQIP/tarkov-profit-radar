# 腾讯云香港部署

使用轻量应用服务器运行 Node 服务和 Nginx，无需另购数据库。现有 Sites 网址仍独立运行，部署包生成不代表已经上云。

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

香港首月可先用公网 IP 做 HTTP 访问测试，暂不购买域名。以下只用于新建的专用实例；先确认 `/etc/nginx/sites-enabled/default` 是系统默认站点链接，再取消该链接：

```sh
ls -l /etc/nginx/sites-enabled/default
sudo unlink /etc/nginx/sites-enabled/default
sudo cp /etc/nginx/sites-available/tarkov-radar /etc/nginx/tarkov-radar.before-public.conf
sudo install -m 0644 /opt/tarkov-radar/current/deploy/tencent/nginx-http.conf.example /etc/nginx/sites-available/tarkov-radar
sudo nginx -t
sudo systemctl reload nginx
```

在腾讯云防火墙放行网站 TCP 80；SSH 22 仅允许管理者来源地址，**不开放8787和8080**。若系统启用了 UFW，也只添加对应规则，不要直接关闭防火墙。此时访问 `http://SERVER_IP/`。HTTP 仅用于首月连通与性能测试，不提供登录、付款或个人数据上传功能。

长期公开入口使用域名和 HTTPS：购买确认的域名，将 A 记录解析到实例 IP，开放 TCP 443，通过证书工具申请证书并配置自动续期，再用 `nginx-public.conf.example` 替换域名和证书路径。启用前运行 `nginx -t`，启用后验证 HTTPS 和自动续期。没有证书时不要直接套用 SSL 示例。香港站点不应使用要求内地备案的加速线路来替代这个步骤。

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
| 备份文件 | `/var/backups/tarkov-radar/ledger-*.tar.gz` |
| 当前版本 | `/opt/tarkov-radar/current/RELEASE.json` |

每天01:15 UTC（北京时间09:15）附近备份已结束日期的收益档案，保留约14天；当日档案在次日纳入。当天实时数据仍依赖源目录。同盘备份只能应对误改，需定期把备份下载到本机；退订或销毁服务器前先保存档案。

升级：上传新包，解压到新的目录，再运行安装器。它会切换版本并做存活检查，失败时回退已有旧版本；随后仍要执行完整核验。若存活正常但业务有问题，停止服务，将 `current` 链接切回 `/opt/tarkov-radar/releases/` 中核实过的旧版本，重启后再次核验。安装器保留已有 Nginx 网站配置。

关注内存、磁盘、采集失败率、接口响应时间和公网出流量。套餐不自动续费不等于阻止所有流量费；试用到期前决定续费、迁移或停止并释放实例。

## 当前验证范围

部署准备阶段已通过61项测试、Shell语法检查、压缩包哈希与换行校验；解压后在独立数据目录启动，三个市场各读取5,480个物品，压缩、缓存及静态文件核验通过。此验证运行在本机 Windows / Node 25，并使用768MB堆上限；不等同于2GB服务器容量压测。Ubuntu安装、systemd、Nginx、备份计时器和香港实际网络仍须在实例开通后验证。正式发布暂缓，等待产品修改完成。

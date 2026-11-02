# QWish

QWish 是一款基于 XPosed 的 QQ 增强模块，提供聊天功能扩展、界面优化及个性化配置，支持在线脚本与表情扩展。

[![Telegram](https://img.shields.io/static/v1?label=Telegram&message=Channel&color=0088cc)](https://t.me/qwishci)

[在线下载](https://service.qwish.top)

## 功能简介

- **聊天增强**：消息防撤回、消息时间显示、消息复读
- **界面优化**：屏蔽部分广告、调整字体及聊天显示效果。
- **社交辅助**：群聊辅助、群签到、QQ 空间相关功能。
- **扩展功能**：在线脚本、在线表情及实验性 MCP 服务。

## 运行要求

- Android 8.1 及以上
- LSPosed 或兼容的 免Root 框架
- 支持 `arm64-v8a` 的设备 (通常设备都支持)
- 目标应用：QQ（`com.tencent.mobileqq`）

## 安装说明

1. 安装模块 APK。
2. 在 框架 中启用 QWish，并勾选 QQ。
3. 重启 QQ，使模块生效。
4. 打开QQ设置界面 QWish 配置界面，根据需要启用对应功能。

## 注意事项

- 修改客户端行为可能导致功能异常，请谨慎使用。
- 请遵守相关法律法规及平台规则，本项目不为此产生的后果负责。
- 如果有任何不可抗力会直接停止维护并禁止用户使用此模块，并删除一切在线成果

业务邮箱:aaasmclk@gmail.com 花清雨 72小时内回复

## 自动发布 Release 原理

- 工作流 Action 和脚本需放在运行仓库的默认分支，发布目标可以是其他仓库
- 例如 Xposed-Modules-Repo 并不允许使用 Action发布，但你可以配置有`public_repo` 权限的 `Personal access tokens (classic)` 进行发布 Xposed-Modules-Repo 的 Release
- 我的做法是放到Fork [repo](https://github.com/suzhelan/top.qwish.xposed/blob/main/.github/workflows/sync-releases.yml)仓库中运行Actions，然后发布到Xposed-Modules-Repo Release

0. 在运行工作流的仓库 **Settings → Secrets and variables → Actions** 中配置：
- **Variables**：`RELEASE_REPOSITORY_URL`，目标仓库 URL，例如 `https://github.com/Xposed-Modules-Repo/top.qwish.xposed`。
- **Secrets**：`RELEASE_TOKEN`，有目标仓库写权限的经典 `Personal access tokens (classic)`；公开仓库需 `public_repo` 权限，私有仓库需 `repo` 权限。

1. GitHub Actions 在每次 push、手动运行或每 30 分钟检查后端接口，
2. 检查后端接口和Release版本差异，如果有新版本则补发到Release


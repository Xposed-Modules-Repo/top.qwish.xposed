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

## 自动发布 Release

在运行工作流的仓库进入 **Settings → Environments**，创建名为 `release` 的环境，并配置：

| 类型 | 名称 | 值 |
| --- | --- | --- |
| Environment variable | `RELEASE_REPOSITORY_URL` | 目标仓库 HTTPS URL，例如 `https://github.com/Xposed-Modules-Repo/top.qwish.xposed`（也支持 `.git` 后缀） |
| Environment secret | `RELEASE_TOKEN` | 有目标仓库写入权限的 Personal access token (classic) |

经典 PAT 发布到公开仓库时需勾选 `public_repo`，私有仓库需勾选 `repo`；Token 所属账号也必须具备目标仓库写权限。如果目标组织启用了 SAML SSO，还需为 Token 授权。参见 [GitHub Token 权限说明](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps#available-scopes) 和 [SSO 授权说明](https://docs.github.com/en/enterprise-cloud@latest/authentication/authenticating-with-single-sign-on/authorizing-a-personal-access-token-for-use-with-single-sign-on)。

工作流使用内置 `GITHUB_TOKEN` 读取当前仓库源码，使用上述经典 PAT 读取目标仓库的 Release 并上传、发布 APK。目标仓库与运行工作流的仓库可以不同；新建标签使用**目标仓库默认分支**，已有标签不变。缺少 URL 或 Token 时直接报错，请勿将 Token 写入 URL 或提交到仓库。

- 每次 push、手动运行，以及每小时第 7、37 分钟检查 `https://service.qwish.top`；所有触发均读取运行仓库默认分支的同步脚本。
- 以目标仓库已发布 Release 的最大 `versionCode` 为基准，只补发更高版本，按 `versionCode` 升序逐个发布；没有符合格式的已发布 Release 时只发布远程最新版。
- 标签为 `{versionCode}-{versionName}`，标题为 `v{versionName}`，正文为 `updateLog`，附件名为 `fileName`，APK 按精确版本号下载。
- 先下载 APK，再创建草稿、上传附件，成功后公开；失败即停止，后续运行复用同标签草稿继续。

将工作流与脚本合入默认分支后启用。GitHub 的定时任务可能排队延迟；公开仓库连续 60 天没有活动时会自动停用定时任务，详见 [定时触发文档](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)。如果为 `release` 环境配置了审批或分支限制，运行也需满足这些规则。

本地运行测试（Node.js 24 或更高版本）：

```sh
node --test .github/scripts/sync-releases.test.cjs
```

# 闲序

轻量、可私有化部署的团队项目管理工具。React + Vite 前端与 NestJS API 构建为一个应用镜像，PostgreSQL 独立运行。

## 本地运行

```bash
docker compose up --build
```

打开 `http://localhost:8080`，注册后会自动创建工作区、项目和四个看板列。

开发模式：复制 `.env.example` 为 `.env`，运行 `pnpm install`，启动 PostgreSQL 后执行 `pnpm db:migrate && pnpm dev`。

## 功能

- 项目看板、任务分类、成员与权限、搜索、归档和删除
- 开放注册、仅邀请和管理员开通三种注册模式，支持一次性邀请与账号设置链接
- 任务修复反馈评论、待修复/已修复状态与图片/设计文档附件
- 静态文件按内容去重、空间配额、引用保护和未引用资源清理
- `.xlsx` 任务表拖拽上传、列映射、数据预览与重复项检查
- 月历按类型和负责人筛选；点击日期创建任务，拖动任务调整截止日期
- 可版本化的 Markdown 设计文档与人工审核后执行的任务计划
- MCP Streamable HTTP 服务：在“设置”中创建独立的只读或读写令牌，地址为部署域名下的 `/mcp`
- GitHub 镜像：可选择任务、文档和 Issues 拉取范围，支持关联 Issue/PR、连接诊断与冲突处理；PostgreSQL 始终是主数据源
- `.taskharbor.zip` 全量备份（含附件原文件）、校验预览和恢复到新工作区

GitHub PAT 需要仓库的 Issues 与 Contents 读写权限。`APP_ENCRYPTION_KEY` 用于 AES-256-GCM 加密 PAT；生产环境必须使用持久且不可公开的随机值，更换后已有 PAT 将无法解密。

静态资源支持常见图片、PDF、DOCX、XLSX、PPTX、Markdown/文本、ZIP、Draw.io、Sketch、Figma、PSD 和 AI 文件。默认单文件上限 10 MB、每工作区 256 MB，可通过 `ASSET_MAX_FILE_BYTES` 和 `ASSET_WORKSPACE_QUOTA_BYTES` 调整；备份导入同样遵守这些限制。Docker Compose 使用独立的 `xian-assets` 数据卷持久化原文件。

## 注册与邀请

`AUTH_REGISTRATION_MODE` 支持 `open`、`invite_only` 和 `admin_only`，默认为 `open`。未创建任何用户时，三种模式都允许首位管理员完成 bootstrap；之后 `invite_only` 与 `admin_only` 会关闭登录页的自助注册入口。

- `open`：允许自助注册并创建工作区。
- `invite_only`：新成员通过管理员生成的 7 天邀请链接注册或加入。
- `admin_only`：管理员直接开通账号，并分享 7 天有效的一次性密码设置链接。

`AUTH_ALLOW_WORKSPACE_CREATE=false` 可禁止已有用户继续创建工作区。管理员可在成员页查看待接受、已接受、已过期和已撤销的邀请，在设置页查看最近 100 条审计记录。

## 交付

- API 文档：`/api/docs`
- MCP 服务：`/mcp`
- 健康检查：`/api/v1/health/live`、`/api/v1/health/ready`
- 镜像只使用 commit SHA 发布；回滚时重新部署上一 SHA。
- 数据库迁移在应用启动前执行，迁移记录保存在 `_migrations`。
- 生产附件持久化、自动备份、恢复演练和回滚步骤见 [`docs/operations.md`](docs/operations.md)。

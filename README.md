# 闲序

轻量、可私有化部署的团队项目管理工具。React + Vite 前端与 NestJS API 构建为一个应用镜像，PostgreSQL 独立运行。

## 本地运行

```bash
docker compose up --build
```

打开 `http://localhost:8080`，注册后会自动创建工作区、项目和四个看板列。

开发模式：复制 `.env.example` 为 `.env`，启动 PostgreSQL 后运行 `npm run db:migrate && npm run dev`。

## 功能

- 项目看板、任务分类、成员与权限、搜索、归档和删除
- 可版本化的 Markdown 设计文档与人工审核后执行的任务计划
- MCP Streamable HTTP 服务：在“设置”中创建独立的只读或读写令牌，地址为部署域名下的 `/mcp`
- GitHub 镜像：任务同步到 Issues，设计文档同步到 Markdown；PostgreSQL 始终是主数据源
- `.taskharbor.zip` 完整备份、校验预览和恢复到新工作区

GitHub PAT 需要仓库的 Issues 与 Contents 读写权限。`APP_ENCRYPTION_KEY` 用于 AES-256-GCM 加密 PAT；生产环境必须使用持久且不可公开的随机值，更换后已有 PAT 将无法解密。

## 交付

- API 文档：`/api/docs`
- MCP 服务：`/mcp`
- 健康检查：`/api/v1/health/live`、`/api/v1/health/ready`
- 镜像只使用 commit SHA 发布；回滚时重新部署上一 SHA。
- 数据库迁移在应用启动前执行，迁移记录保存在 `_migrations`。

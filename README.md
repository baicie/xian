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
- `.xlsx` 任务表拖拽上传、列映射、数据预览与重复项检查
- 月历按类型和负责人筛选；点击日期创建任务，拖动任务调整截止日期
- 可版本化的 Markdown 设计文档与人工审核后执行的任务计划
- MCP Streamable HTTP 服务：在“设置”中创建独立的只读或读写令牌，地址为部署域名下的 `/mcp`
- GitHub 镜像：可选择任务、文档和 Issues 拉取范围，支持关联 Issue/PR、连接诊断与冲突处理；PostgreSQL 始终是主数据源
- `.taskharbor.zip` 完整备份、校验预览和恢复到新工作区

GitHub PAT 需要仓库的 Issues 与 Contents 读写权限。`APP_ENCRYPTION_KEY` 用于 AES-256-GCM 加密 PAT；生产环境必须使用持久且不可公开的随机值，更换后已有 PAT 将无法解密。

## 交付

- API 文档：`/api/docs`
- MCP 服务：`/mcp`
- 健康检查：`/api/v1/health/live`、`/api/v1/health/ready`
- 镜像只使用 commit SHA 发布；回滚时重新部署上一 SHA。
- 数据库迁移在应用启动前执行，迁移记录保存在 `_migrations`。

# 生产运维手册

## 持久化数据

生产部署使用三个 Docker 卷：

- `xian-data`：PostgreSQL 数据。
- `xian-assets`：用户上传的附件原文件。
- `xian-backups`：部署前快照和每日自动快照。

发布流程会在应用迁移数据库之前生成 `predeploy-*.dump` 和对应的附件压缩包。`backup` 服务默认每 24 小时生成一次快照并保留 14 天，可通过 `BACKUP_INTERVAL_SECONDS` 和 `BACKUP_RETENTION_DAYS` 调整。

## 恢复演练

1. 停止应用写入：`docker compose stop app backup`。
2. 从备份卷取出目标 `db-*.dump` 和 `assets-*.tar.gz`。
3. 重建空数据库后执行：`pg_restore --clean --if-exists --no-owner -d xian <backup.dump>`。
4. 清空附件卷后，将附件压缩包解压到附件卷根目录。
5. 启动服务：`docker compose up -d`。
6. 验证 `/api/v1/health/ready`，再登录检查任务、文档和附件下载。

至少每月在隔离环境执行一次恢复演练，并记录恢复耗时与抽样校验结果。恢复演练不得覆盖生产卷。

## 发布与回滚

镜像使用 commit SHA 标识。部署后会检查数据库就绪状态和首页；检查失败时发布脚本会重新启动上一镜像。数据库迁移必须保持向后兼容，删除字段等破坏性迁移应拆成多个版本发布。

生产环境应设置 `PERF_APP_ORIGIN` 为 HTTPS 公网地址，并通过反向代理终止 TLS。数据库密码和应用加密密钥由部署主机持久保存，禁止写入仓库或日志。

## 访问控制

生产私有实例建议设置：

```dotenv
AUTH_REGISTRATION_MODE=admin_only
AUTH_ALLOW_WORKSPACE_CREATE=false
```

空数据库仍允许首位管理员 bootstrap。完成后，`admin_only` 只允许管理员在成员页开通账号；生成的 setup link 为一次性链接，7 天后过期。`invite_only` 使用相同有效期的工作区邀请链接。链接只在创建时返回明文，数据库仅保存 SHA-256 摘要。

认证模式值无效时系统按 `admin_only` 处理，避免配置拼写错误意外开放注册。部署后应检查 `/api/v1/auth/config` 返回的 `registrationMode` 和 `bootstrapAvailable`。

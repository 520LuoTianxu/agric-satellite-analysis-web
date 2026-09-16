# ADR 0001：前端采用静态导出部署

- 状态：已采用
- 日期：2026-09-16

## 背景

测试环境的前端部署平台适合发布 `dist/` 等静态文件，但当前 Next.js standalone 服务依赖 Node 进程，导致反向代理在 Node 未启动时返回 502。前端页面主要在浏览器中请求后端 API，适合将页面资源与 API 服务拆开部署。

## 决策

使用 Next.js `output: "export"` 生成 `out/` 静态产物。动态农场、地块和分享页面改为固定静态页面，通过查询参数传递 ID/token；浏览器 API 请求使用前端同源的 `/v1/` 路径，由 Nginx 转发到后端服务。静态资源目录由 `deploy.sh` 发布到 `/data/mwbase/agric-satellite-analysis-web`，实际目录可通过 `APP_DIR` 覆盖。

## 影响

- 前端发布不再需要 Node、PM2 或 systemd，Nginx 直接读取静态文件。
- Next.js middleware、服务端 API 路由和服务端 rewrite 不再参与生产部署。
- `/v1/` API 仍然保留动态能力，由 Nginx 代理到 FastAPI 后端。
- `NEXT_PUBLIC_BASE_PATH`、`NEXT_PUBLIC_API_URL` 必须在构建前设置；两者都属于构建时配置。
- 本地完整 Docker Compose 的 Web 容器改为 Nginx 80 端口，外部本地端口仍可映射为 3000。

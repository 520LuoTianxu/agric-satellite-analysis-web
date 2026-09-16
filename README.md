# agric-satellite-analysis-web

独立的 Next.js 前端项目，服务于 agric-satellite-analysis 后端。仓库只包含 Web UI，不包含 API、Celery worker 或数据库迁移。

## 本地开发

```bash
npm ci
cp .env.example .env.local
npm run dev
```

常用检查命令：

```bash
npm run lint
npm run type-check
npm run build
python scripts/check-i18n-keys.py
```

默认前端地址为 `http://localhost:3000`，API 地址通过 `NEXT_PUBLIC_API_URL` 配置。

## 静态部署

本项目使用 Next.js 静态导出，构建产物为 `out/`，不需要启动 Node 服务。部署到子路径时，必须在构建前设置路径前缀，并让 Nginx 将统一的 `/satellite-api/` 请求转发到后端的 `/v1/` 接口：

```bash
export NEXT_PUBLIC_BASE_PATH=/agric-satellite-analysis-web
export NEXT_PUBLIC_API_URL=/satellite-api
export NEXT_PUBLIC_SITE_URL=https://joint-venture-test.cdfinance.com.cn/agric-satellite-analysis-web
rm -rf node_modules && rm -rf .next && rm -rf out && npm install && npm run build
```

平台 Node 版本使用 `.nvmrc` 中的 Node 20，推荐出包路径填写 `out/`。如果平台固定使用旧配置 `target=.next/standalone` 也可以，构建后的 `postbuild` 会把静态文件同步到该目录，`deploy.sh` 会自动识别。服务器发布目录可使用 `/data/mwbase/agric-satellite-analysis-web`，再执行仓库中的 `deploy.sh`。`NEXT_PUBLIC_BASE_PATH` 和 `NEXT_PUBLIC_API_URL` 都是在构建时写入前端的配置。

## Docker Compose 集成

完整栈的 Compose 文件位于后端仓库。两个仓库需要放在同一个外层目录，并使用默认目录名：

```text
agric-satellite-analysis-workspace/
├── agric-satellite-analysis-api/
└── agric-satellite-analysis-web/
```

在后端目录执行 Compose 时，后端的 `web` 服务会使用本仓库根目录作为 Docker build context：

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

生产部署、API 和数据库配置请查看后端仓库的 `README.md` 和 `DEPLOYMENT.md`。

## 目录说明

- `src/`：Next.js App Router 页面、组件、API client 和国际化配置
- `messages/`：`zh`、`en`、`es` 翻译文件
- `public/glossary/`：指数与卫星说明资源
- `Dockerfile`：独立前端生产镜像

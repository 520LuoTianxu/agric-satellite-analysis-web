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

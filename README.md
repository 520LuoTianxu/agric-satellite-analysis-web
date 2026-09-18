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

本地 `npm run dev` 将 `/bapi`、`/agric-api`、`/admin-api` 转发到正式网关 `https://joint-venture.cdfinance.com.cn`（`JOINT_VENTURE_PROXY`），`/satellite-api` 独立转发到测试网关 `https://joint-venture-test.cdfinance.com.cn`（`SATELLITE_API_PROXY`）。

## 地图底图

默认卫星底图使用与 `agric-admin-front` 的 `AMap.TileLayer.Satellite()` 同源的高德卫星瓦片，并叠加同源道路标注瓦片；17–20 级再叠加管理端 `map-info` 高清瓦片，避免高德原生卫星图在高层级返回“此区域无卫星图”。所有展示层保持 GCJ-02，地块数据仍保存 WGS84。

- 高德标注层显示省、市、区县、村镇、道路和兴趣点名称；高德底图不可用时回到 OSM 街道图，并保留地块、绘制内容及热力图。
- 高层级业务高清瓦片复刻农业管理端的范围选择：按 `map_new_data_range` / `map_new_data_area` 的 XYZ 范围在 `ghr`、`Map2025Shandong`、`uat` 三个目录中选择；本地开发通过 `/basemap-admin-satellite/` 同源代理，避免 localhost 跨域失败，也避免“无卫星图”占位瓦片覆盖高德底图。
- 数据库地块边界统一保存 WGS84；仅在高德地图展示和编辑时转换为 GCJ-02，保存时反向转换回 WGS84。
- 普通地图、绘制地图及分享报告使用同一套配置，不再请求 Esri 的 `World_Imagery`。

高德底图通过浏览器瓦片接口加载，不需要把高德 Web JS API Key 写入当前项目；农业管理端的业务搜索、编辑能力仍由其自身 AMap JS SDK 负责。

测试环境使用仓库中的 `.env.test`（仅包含前端公开配置和网关地址），构建命令为 `npm run build:test`。该命令显式加载测试站点子路径和直连网关配置，检查必需配置，并禁用覆盖卫星样式的 PMTiles 自动升级。测试发布平台应使用此命令；仅执行 `npm run build` 不会自动加载 `.env.test`。直连网关必须允许测试站点来源的 CORS 请求。不要在该文件中添加数据库密码或服务端密钥。

地图回归检查：`node scripts/verify-basemap.mjs`；真实浏览器瓦片与 403 降级验证：`python scripts/verify-basemap-ui.py`（需 Playwright、Chromium 和 Pillow）。

## 静态部署

本项目使用 Next.js 静态导出，构建产物为 `out/`，不需要启动 Node 服务。静态构建不会执行 `next.config.js` 的 rewrites，因此测试构建通过 `NEXT_PUBLIC_DIRECT_API_PROXY=true` 将 API 网关地址直接写入浏览器代码：`/bapi/`、`/agric-api/`、`/admin-api/` 访问正式网关 `https://joint-venture.cdfinance.com.cn`，`/satellite-api/` 访问测试网关 `https://joint-venture-test.cdfinance.com.cn`，无需依赖部署端 Nginx 反代。直连模式要求两个网关允许测试站点来源的 CORS 请求。

部署到子路径时，仍需在构建前设置路径前缀和同源 API 前缀：

```bash
export NEXT_PUBLIC_BASE_PATH=/agric-satellite-analysis-web
export NEXT_PUBLIC_API_URL=/satellite-api
export NEXT_PUBLIC_SITE_URL=https://joint-venture-test.cdfinance.com.cn/agric-satellite-analysis-web
rm -rf node_modules && rm -rf .next && rm -rf out && npm install && npm run build
```

平台 Node 版本使用 `.nvmrc` 中的 Node 20，推荐出包路径填写 `out/`。如果平台固定使用旧配置 `target=.next/standalone` 也可以，构建后的 `postbuild` 会把静态文件同步到该目录，`deploy.sh` 会自动识别。服务器发布目录可使用 `/data/mwbase/agric-satellite-analysis-web`，再执行仓库中的 `deploy.sh`。`NEXT_PUBLIC_BASE_PATH`、`NEXT_PUBLIC_API_URL` 和直连开关都必须在构建前设置；`JOINT_VENTURE_PROXY`、`SATELLITE_API_PROXY` 仅用于本地 Next 代理。

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

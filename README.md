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

本地 `npm run dev` 将 `/bapi`、`/agric-api`、`/admin-api` 转发到正式网关 `https://joint-venture.cdfinance.com.cn`（`JOINT_VENTURE_PROXY`），`/satellite-api` 独立转发到测试网关 `https://joint-venture-test.cdfinance.com.cn`（`SATELLITE_API_PROXY`）。静态部署的接口转发仍由部署端 Nginx 配置。

## 地图底图

默认卫星底图复用 `agric-admin-front` 中的 `2025_WGS84_HIGH_Satellite` 自维护瓦片，使用 WGS84 经纬度和 Web Mercator 瓦片网格，与地块边界和遥感热力图保持一致，无需引入高德 JS SDK 或转换业务坐标。

- 高清数据提供 16–19 级、256 像素瓦片，对应 MapLibre 视图从 15 级起显示；继续放大会复用 19 级影像，不请求不存在的 20 级瓦片。
- `NEXT_PUBLIC_TIANDITU_KEY` 配置浏览器端天地图 Key 后，低级别也显示卫星影像；高清瓦片缺失时保留正常的天地图影像，所有影像源不可用时回到 OSM 街道图，并保留地块、绘制内容及热力图。
- `NEXT_PUBLIC_SATELLITE_TILE_URL` 可在构建前覆盖卫星瓦片模板，默认复用农业管理端的 OSS 地址。替换源需保持 WGS84、XYZ 网格和相同层级范围。
- 本地 `next dev` 默认通过 `/basemap-satellite/` 同源代理，兼容 OSS 不允许 localhost 的 CORS 配置；静态部署直连 OSS，部署域名需在该桶的 CORS 白名单内（已验证测试域名）。自定义模板需自行允许页面来源跨域。
- 普通地图、绘制地图及分享报告使用同一套配置，不再请求 Esri 的 `World_Imagery`。

天地图浏览器 Key 应保存在 `.env.local` 或 CI 环境变量中，构建前注入；命令行直接请求可能被拒绝，应以浏览器验证为准。农业管理端旧 AMap 图层使用的 GCJ-02 瓦片没有直接混入 WGS84 地块图层。

测试环境使用仓库中的 `.env.test`（仅包含前端公开配置和浏览器端地图 Key），构建命令为 `npm run build:test`。该命令显式加载测试站点子路径、天地图 Key 与高清卫星瓦片地址，检查必需的地图配置，并禁用覆盖卫星样式的 PMTiles 自动升级。测试发布平台应使用此命令；仅执行 `npm run build` 不会自动加载 `.env.test`。不要在该文件中添加数据库密码或服务端密钥。

地图回归检查：`node scripts/verify-basemap.mjs`；真实浏览器瓦片与 403 降级验证：`python scripts/verify-basemap-ui.py`（需 Playwright、Chromium 和 Pillow）。

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

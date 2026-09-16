/** @type {import('next').NextConfig} */

const createNextIntlPlugin = require("next-intl/plugin");
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// 子路径必须在构建时确定，Next.js 会据此生成静态资源和页面路由地址。
// 测试平台会注入 CI_SOURCE_NAME；未显式配置前缀时按项目名自动使用测试子路径。
// 显式设置 NEXT_PUBLIC_BASE_PATH（包括空字符串）时，以显式配置为准，兼容根路径部署。
const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH;
const ciDefaultBasePath =
    process.env.CI_SOURCE_NAME === "agric-satellite-analysis-web"
        ? "/agric-satellite-analysis-web"
        : "";
const BASE_PATH_NAME = (configuredBasePath ?? ciDefaultBasePath)
    .trim()
    .replace(/^\/+|\/+$/g, "");
const BASE_PATH = BASE_PATH_NAME ? `/${BASE_PATH_NAME}` : "";

const nextConfig = {
    // 静态发布由 Nginx 直接读取 out/，API 由 Nginx 单独代理到后端服务。
    output: "export",
    trailingSlash: true,
    basePath: BASE_PATH,
    // 将自动推导出的前缀注入浏览器代码，保证 API、分享链接和地图资源也使用同一前缀。
    env: {
        NEXT_PUBLIC_BASE_PATH: BASE_PATH,
    },
};

module.exports = withNextIntl(nextConfig);

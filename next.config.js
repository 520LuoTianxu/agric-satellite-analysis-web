/** @type {import('next').NextConfig} */

const createNextIntlPlugin = require("next-intl/plugin");
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// 子路径必须在构建时确定，Next.js 会据此生成静态资源和页面路由地址。
// 留空时保持根路径部署，兼容本地开发和现有根路径环境。
const BASE_PATH_NAME = (process.env.NEXT_PUBLIC_BASE_PATH || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
const BASE_PATH = BASE_PATH_NAME ? `/${BASE_PATH_NAME}` : "";

const nextConfig = {
    // 静态发布由 Nginx 直接读取 out/，API 由 Nginx 单独代理到后端服务。
    output: "export",
    trailingSlash: true,
    basePath: BASE_PATH,
};

module.exports = withNextIntl(nextConfig);

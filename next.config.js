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

const TEST_API_ORIGIN = "https://joint-venture-test.cdfinance.com.cn";

// 本地代理和静态构建的前端网关都限定到测试域名，配置漂移时直接失败，避免误调生产接口。
function getTestApiOrigin(name) {
    const origin = (process.env[name] || TEST_API_ORIGIN).trim().replace(/\/+$/, "");
    if (origin !== TEST_API_ORIGIN) {
        throw new Error(`${name} 必须配置为测试 API 域名 ${TEST_API_ORIGIN}`);
    }
    return origin;
}

const JOINT_VENTURE_PROXY = getTestApiOrigin("JOINT_VENTURE_PROXY");
const SATELLITE_API_PROXY = getTestApiOrigin("SATELLITE_API_PROXY");
const NEXT_PUBLIC_JOINT_VENTURE_PROXY = getTestApiOrigin("NEXT_PUBLIC_JOINT_VENTURE_PROXY");
const NEXT_PUBLIC_SATELLITE_API_PROXY = getTestApiOrigin("NEXT_PUBLIC_SATELLITE_API_PROXY");
const DIRECT_API_PROXY =
    process.env.NEXT_PUBLIC_DIRECT_API_PROXY ??
    (process.env.NODE_ENV === "development" ? "false" : "true");
const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "/satellite-api";

if (process.env.NODE_ENV === "production" && DIRECT_API_PROXY !== "true") {
    throw new Error("静态构建必须启用 API 直连，确保所有前端 API 请求使用测试网关。");
}

if (
    process.env.NODE_ENV === "production" &&
    (!NEXT_PUBLIC_API_URL.startsWith("/") || NEXT_PUBLIC_API_URL.startsWith("//"))
) {
    throw new Error("静态构建的 NEXT_PUBLIC_API_URL 必须使用路径，API 域名由测试网关统一注入。");
}

/** @type {import('next').NextConfig} */
const nextConfig = {
    // 静态发布由静态服务器直接读取 out/；API 路由按构建配置保持同源或直连网关。
    trailingSlash: true,
    basePath: BASE_PATH,
    // 将自动推导出的前缀注入浏览器代码，保证 API、分享链接和地图资源也使用同一前缀。
    env: {
        NEXT_PUBLIC_BASE_PATH: BASE_PATH,
        NEXT_PUBLIC_DIRECT_API_PROXY: DIRECT_API_PROXY,
        NEXT_PUBLIC_JOINT_VENTURE_PROXY,
        NEXT_PUBLIC_SATELLITE_API_PROXY,
    },
};

if (process.env.NODE_ENV === "production") {
    nextConfig.output = "export";
} else {
    // 静态导出没有 rewrite；本地登录、农业业务和卫星分析统一使用测试网关。
    nextConfig.rewrites = async () => [
        // 卫星 OSS 未允许 localhost 跨域；开发环境同源代理，生产静态站点直连业务域名白名单图源。
        {
            source: "/basemap-satellite/:path*",
            destination: "https://cfpamf-map-info.oss-cn-beijing.aliyuncs.com/2025_WGS84_HIGH_Satellite/:path*",
        },
        // 管理端 16–19 级统一高清瓦片本地同源代理，避免 map-info 服务拒绝 localhost 跨域请求。
        {
            source: "/basemap-admin-satellite/:path*",
            // 高清目录由前端固定为 2025_WGS84_HIGH_Satellite，不能回退到会产生色带的 uat。
            destination: "https://map-info.cdfinance.com.cn/:path*",
        },
        { source: "/bapi/:path*", destination: `${JOINT_VENTURE_PROXY}/bapi/:path*` },
        { source: "/agric-api/:path*", destination: `${JOINT_VENTURE_PROXY}/agric-api/:path*` },
        { source: "/admin-api/:path*", destination: `${JOINT_VENTURE_PROXY}/admin-api/:path*` },
        { source: "/satellite-api/:path*", destination: `${SATELLITE_API_PROXY}/satellite-api/:path*` },
        // next-intl as-needed：开发时把无前缀路径转到默认语言，生产由 prepare-static-output 复制 out/zh。
        { source: "/", destination: "/zh" },
        {
            source: "/:path((?!en|es|zh|_next|satellite-api|basemap-satellite|bapi|agric-api|admin-api).*)",
            destination: "/zh/:path",
        },
    ];
}

module.exports = withNextIntl(nextConfig);

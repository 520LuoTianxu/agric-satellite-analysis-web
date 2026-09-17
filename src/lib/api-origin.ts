/**
 * 浏览器直连网关的开关和地址。
 *
 * 测试静态站点没有可执行的 Next.js rewrite 时，构建配置会开启直连，
 * 让浏览器把业务和卫星请求分别发往对应网关；本地开发保持关闭，继续使用
 * next.config.js 的同源代理，避免改变现有联调方式。
 */
const DIRECT_API_PROXY = process.env.NEXT_PUBLIC_DIRECT_API_PROXY === "true";
const BUSINESS_API_ORIGIN = normalizeOrigin(process.env.NEXT_PUBLIC_JOINT_VENTURE_PROXY);
const SATELLITE_API_ORIGIN = normalizeOrigin(process.env.NEXT_PUBLIC_SATELLITE_API_PROXY);

function normalizeOrigin(value: string | undefined): string {
    return (value || "").trim().replace(/\/+$/, "");
}

export type ApiGateway = "business" | "satellite";

function gatewayOrigin(gateway: ApiGateway): string {
    return gateway === "satellite" ? SATELLITE_API_ORIGIN : BUSINESS_API_ORIGIN;
}

/**
 * 将 API 路径转换成当前部署可用的 URL。
 * 已经是绝对 URL 的调用（例如上传接口返回的 OSS 地址）原样保留。
 */
export function resolveGatewayUrl(pathOrUrl: string, gateway: ApiGateway): string {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;

    const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
    if (!DIRECT_API_PROXY) return path;

    const origin = gatewayOrigin(gateway);
    return origin ? `${origin}${path}` : path;
}

export function isDirectApiProxyEnabled(): boolean {
    return DIRECT_API_PROXY;
}

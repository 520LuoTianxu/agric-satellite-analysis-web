const TEST_API_ORIGIN = "https://joint-venture-test.cdfinance.com.cn";

/** 静态包会把 API 地址写入浏览器代码，构建前校验，防止环境变量将请求指向生产服务。 */
module.exports = function validateTestApiOrigin() {
    for (const name of [
        "NEXT_PUBLIC_JOINT_VENTURE_PROXY",
        "NEXT_PUBLIC_SATELLITE_API_PROXY",
    ]) {
        const configured = process.env[name]?.trim();
        if (!configured) {
            throw new Error(`静态构建配置缺失：${name}，请检查环境文件。`);
        }

        let origin;
        try {
            origin = new URL(configured).origin;
        } catch {
            throw new Error(`${name} 必须是有效的测试 API 地址：${TEST_API_ORIGIN}`);
        }

        if (origin !== TEST_API_ORIGIN) {
            throw new Error(`${name} 必须配置为测试 API 域名 ${TEST_API_ORIGIN}`);
        }
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
    if (!apiUrl?.startsWith("/") || apiUrl.startsWith("//")) {
        throw new Error("NEXT_PUBLIC_API_URL 必须使用同源 API 路径，网关域名由测试配置统一注入。");
    }
};

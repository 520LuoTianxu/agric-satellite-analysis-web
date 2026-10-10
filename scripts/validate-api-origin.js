const { getApiEnvironment, getApiOrigin } = require("./api-origin-config");

/** 静态包会把 API 地址写入浏览器代码，构建前校验目标环境，避免生产和测试接口串用。 */
module.exports = function validateApiOrigin() {
    getApiEnvironment();
    for (const name of [
        "NEXT_PUBLIC_JOINT_VENTURE_PROXY",
        "NEXT_PUBLIC_SATELLITE_API_PROXY",
    ]) {
        if (!process.env[name]?.trim()) {
            throw new Error("静态构建配置缺失：" + name + "，请检查对应环境文件。");
        }
        getApiOrigin(name);
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
    if (!apiUrl?.startsWith("/") || apiUrl.startsWith("//")) {
        throw new Error("NEXT_PUBLIC_API_URL 必须使用同源 API 路径，网关域名由 API_ENV 对应的配置注入。");
    }
};

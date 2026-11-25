const API_ORIGINS = Object.freeze({
    test: "https://joint-venture-test.cdfinance.com.cn",
    production: "https://joint-venture.cdfinance.com.cn",
});

function getApiEnvironment() {
    const configured = process.env.API_ENV?.trim();
    const environment = configured || (process.env.NODE_ENV === "development" ? "test" : "production");
    if (!Object.prototype.hasOwnProperty.call(API_ORIGINS, environment)) {
        throw new Error("API_ENV 必须配置为 test 或 production。");
    }
    if (process.env.NODE_ENV === "development" && environment !== "test") {
        throw new Error("本地开发只允许使用测试 API，避免误请求生产数据。");
    }
    return environment;
}

function assertApiEnvironment(expected) {
    const actual = getApiEnvironment();
    if (actual !== expected) {
        throw new Error("当前构建要求 API_ENV=" + expected + "，实际配置为 " + actual + "。");
    }
}

function getApiOrigin(name) {
    const environment = getApiEnvironment();
    const expectedOrigin = API_ORIGINS[environment];
    const configured = (process.env[name] || expectedOrigin).trim().replace(/\/+$/, "");
    if (configured !== expectedOrigin) {
        const label = environment === "production" ? "正式" : "测试";
        throw new Error(name + " 必须配置为" + label + " API 域名 " + expectedOrigin);
    }
    return configured;
}

module.exports = { API_ORIGINS, getApiEnvironment, assertApiEnvironment, getApiOrigin };

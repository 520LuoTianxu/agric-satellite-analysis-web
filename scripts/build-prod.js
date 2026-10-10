const { spawnSync } = require("node:child_process");
const { assertApiEnvironment } = require("./api-origin-config");

assertApiEnvironment("production");

// 生产静态站点需要在构建时内联 API 地址，禁止配置缺失时静默使用本地默认值。
for (const name of ["NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_SITE_URL"]) {
    if (!process.env[name]?.trim()) {
        throw new Error(`生产构建配置缺失：${name}，请检查 .env.prod。`);
    }
}

// 静态导出无法执行 Next.js rewrite，必须直连正式网关；目标环境由 API_ENV 和 .env.prod 显式决定。
if (process.env.NEXT_PUBLIC_DIRECT_API_PROXY !== "true") {
    throw new Error("生产静态构建必须开启 NEXT_PUBLIC_DIRECT_API_PROXY=true，确保 API 请求直连正式网关。");
}

require("./validate-api-origin")();

const result = spawnSync(process.execPath, [process.env.npm_execpath, "run", "build"], {
    stdio: "inherit",
    env: process.env,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);

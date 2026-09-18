const { spawnSync } = require("node:child_process");

// 生产静态站点需要在构建时内联 API 地址，禁止配置缺失时静默使用本地默认值。
for (const name of ["NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_SITE_URL"]) {
    if (!process.env[name]?.trim()) {
        throw new Error(`生产构建配置缺失：${name}，请检查 .env.prod。`);
    }
}

// 使用同源反向代理时只需要 NEXT_PUBLIC_API_URL；直连网关时必须同时提供两个业务域名。
if (process.env.NEXT_PUBLIC_DIRECT_API_PROXY === "true") {
    for (const name of ["NEXT_PUBLIC_JOINT_VENTURE_PROXY", "NEXT_PUBLIC_SATELLITE_API_PROXY"]) {
        if (!process.env[name]?.trim()) {
            throw new Error(`生产直连配置缺失：${name}，请检查 .env.prod。`);
        }
    }
}

const result = spawnSync(process.execPath, [process.env.npm_execpath, "run", "build"], {
    stdio: "inherit",
    env: process.env,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);

const { spawnSync } = require("node:child_process");

// Next 的生产构建不会自动读取 .env.test，由入口的 --env-file 显式加载测试配置。
// 测试站点要求直接访问两个网关，缺少配置时直接终止构建，
// 避免静默发布成错误的接口地址或重新依赖部署端反向代理。
for (const name of [
    "NEXT_PUBLIC_JOINT_VENTURE_PROXY",
    "NEXT_PUBLIC_SATELLITE_API_PROXY",
]) {
    if (!process.env[name]?.trim()) {
        throw new Error(`测试构建配置缺失：${name}，请检查 .env.test 或 CI 环境变量。`);
    }
}
if (process.env.NEXT_PUBLIC_DIRECT_API_PROXY !== "true") {
    throw new Error("测试静态构建必须开启 NEXT_PUBLIC_DIRECT_API_PROXY=true，避免依赖 Nginx 反代。");
}

require("./validate-test-api-origin")();

// 禁止旧 CI 的 PMTiles 配置在地图加载后把卫星底图替换成矢量底图。
process.env.NEXT_PUBLIC_PROTOMAPS_URL = "";
const result = spawnSync(process.execPath, [process.env.npm_execpath, "run", "build"], {
    stdio: "inherit",
    env: process.env,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);

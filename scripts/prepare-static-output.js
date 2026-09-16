const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const outputDir = path.join(projectRoot, "out");
const defaultLocaleDir = path.join(outputDir, "zh");
const legacyStandaloneDir = path.join(projectRoot, ".next", "standalone");

if (!fs.existsSync(path.join(defaultLocaleDir, "index.html"))) {
    console.error("Static export is missing the default locale output at out/zh");
    process.exit(1);
}

// next-intl 的默认语言使用 as-needed，不带 /zh；复制一份静态入口让 Nginx 能直接服务根路径。
for (const entry of fs.readdirSync(defaultLocaleDir)) {
    fs.cpSync(
        path.join(defaultLocaleDir, entry),
        path.join(outputDir, entry),
        { recursive: true, force: true },
    );
}

console.log("Prepared default-locale aliases at the static export root");

// 兼容部署平台固定打包 .next/standalone 的旧配置；该目录只存放静态文件，不代表还需要 Node 服务。
fs.rmSync(legacyStandaloneDir, { recursive: true, force: true });
fs.mkdirSync(legacyStandaloneDir, { recursive: true });
fs.cpSync(outputDir, legacyStandaloneDir, { recursive: true });

console.log("Mirrored static export to .next/standalone for deployment compatibility");

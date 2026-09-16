const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const standaloneDir = path.join(projectRoot, ".next", "standalone");
const publicDir = path.join(projectRoot, "public");
const staticDir = path.join(projectRoot, ".next", "static");

if (!fs.existsSync(path.join(standaloneDir, "server.js"))) {
    console.error("Next.js standalone output is missing server.js");
    process.exit(1);
}

if (fs.existsSync(publicDir)) {
    // standalone 产物默认不包含 public，复制后才能让 Nginx/Node 运行包读取静态资源。
    fs.cpSync(publicDir, path.join(standaloneDir, "public"), { recursive: true });
}

if (!fs.existsSync(staticDir)) {
    console.error("Next.js build output is missing .next/static");
    process.exit(1);
}

// standalone 产物默认不包含 .next/static，复制后客户端 JS/CSS 才能正常加载。
fs.mkdirSync(path.join(standaloneDir, ".next"), { recursive: true });
fs.cpSync(staticDir, path.join(standaloneDir, ".next", "static"), { recursive: true });

console.log("Prepared self-contained Next.js standalone output");

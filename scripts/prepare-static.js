const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const source = path.join(projectRoot, "CHANGELOG.md");
const targetDir = path.join(projectRoot, "public");
const target = path.join(targetDir, "CHANGELOG.md");

if (!fs.existsSync(source)) {
    console.error("CHANGELOG.md is missing from the project root");
    process.exit(1);
}

// 静态站点没有 Next API 路由，构建前将变更日志复制到 public 供浏览器直接读取。
fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);

console.log("Prepared public/CHANGELOG.md for static export");

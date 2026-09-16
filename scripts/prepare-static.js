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

// PDF 渲染资源与依赖版本同步发布，子路径部署时也能加载 worker 和中文字体。
const pdfjsRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
const pdfjsTarget = path.join(targetDir, "pdfjs");
fs.mkdirSync(pdfjsTarget, { recursive: true });
fs.copyFileSync(path.join(pdfjsRoot, "legacy/build/pdf.worker.min.mjs"), path.join(pdfjsTarget, "pdf.worker.min.mjs"));
for (const folder of ["cmaps", "standard_fonts", "wasm"]) {
    fs.cpSync(path.join(pdfjsRoot, folder), path.join(pdfjsTarget, folder), { recursive: true, force: true });
}
console.log("Prepared local PDF preview assets");

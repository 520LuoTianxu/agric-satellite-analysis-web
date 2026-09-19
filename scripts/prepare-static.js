const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const source = path.join(projectRoot, "CHANGELOG.md");
const targetDir = path.join(projectRoot, "public");
const target = path.join(targetDir, "CHANGELOG.md");

async function prepareProvinceBoundaries() {
    // 静态站点无法在运行时代理 DataV；构建时缓存省→市边界，避免浏览器直连偶发 403。
    const geoDir = path.join(targetDir, "geo");
    const countryFile = path.join(geoDir, "100000_full.json");
    if (!fs.existsSync(countryFile)) {
        console.warn("Skipped province boundary cache: public/geo/100000_full.json is missing");
        return;
    }
    let country;
    try {
        country = JSON.parse(fs.readFileSync(countryFile, "utf8"));
    } catch (error) {
        console.warn("Skipped province boundary cache: invalid country GeoJSON", error);
        return;
    }
    const codes = [...new Set(
        (country.features || [])
            .map((feature) => String(feature?.properties?.adcode ?? ""))
            .filter((code) => /^\d{6}$/.test(code) && code !== "100000"),
    )];
    fs.mkdirSync(geoDir, { recursive: true });
    const results = await Promise.all(codes.map(async (code) => {
        const targetFile = path.join(geoDir, `${code}_full.json`);
        if (fs.existsSync(targetFile)) return { code, status: "cached" };
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(`https://geo.datav.aliyun.com/areas_v3/bound/${code}_full.json`, {
                headers: { "User-Agent": "agric-satellite-analysis-web-build" },
                signal: controller.signal,
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const body = await response.text();
            JSON.parse(body);
            fs.writeFileSync(targetFile, body);
            return { code, status: "downloaded" };
        } catch (error) {
            return { code, status: "failed", error: error instanceof Error ? error.message : String(error) };
        } finally {
            clearTimeout(timer);
        }
    }));
    const failed = results.filter((item) => item.status === "failed");
    const downloaded = results.filter((item) => item.status === "downloaded").length;
    console.log(`Prepared province boundary cache: ${downloaded} downloaded, ${codes.length - failed.length - downloaded} cached`);
    for (const item of failed) console.warn(`Province boundary ${item.code} cache failed: ${item.error}`);
}

async function main() {
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

    await prepareProvinceBoundaries();
}

main().catch((error) => {
    console.error("Static asset preparation failed", error);
    process.exit(1);
});

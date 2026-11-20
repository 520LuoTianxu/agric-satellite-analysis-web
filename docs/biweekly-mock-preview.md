# 种植双周报：扁平时间轴 + 真实Mock PDF

本轮基于master `debd05a`（PR16已合并），分支`feat/biweekly-flat-timeline`。最新t30–32指示取代嵌套卡片树，且明确前端持续Mock、后台后续独立写逻辑，等「对接」指令才接真实数据。

## 入口

- 正常地块详情 → 与「地块分析」平级的「种植双周报」。首级页签及默认长势、原有业务分区和认证策略未改。
- `/biweekly-demo/`、`/en/biweekly-demo/`、`/es/biweekly-demo/`为同组件的宽幅独立预览。正文/PDF中文优先；不是绕过OrgAccessGuard的入口。
- Node24；`npm ci`；`npm run dev -- --port 3214`。构建`npm run build:test`，按既有流程发布out/（本任务不部署）。本次静态产物basePath为`/agric-satellite-analysis-web`，本地预览：
  `http://localhost:3214/agric-satellite-analysis-web/biweekly-demo/`

## 扁平交互

- 一个白色横向模块，绿色S1/青色S2/琥珀色S3阶段连续色带，下方对齐生育期分段、月份尺、报告圆点和选中游标。S标签为农艺阶段，不是Sentinel传感器；圆点是**报告记录**，不是卫星观测点。
- 按实际模拟日期等比例定位。冬小麦约1536px全季轴，玉米最小720px；短生育期保持可读短名/日期，并有完整title/aria-label。只有轴横滚，不是整个页面；选择或调整侧栏宽度时只在轴内居中选中点。
- 冬小麦/玉米各4期。报告按起始日定位/归档；跨期只列一次，正文注记覆盖生育期。点击生育期选其最新报告；未来/无报告期清空正文显示空状态，不保留上一期的假象。
- 上一份/下一份为全季报告导航，端点禁用；空期也能回到最近已有报告。生育期内用一个原生select切换期次，圆点可直接选择；所有选中态可键盘操作。
- 正文正常流展示简明原始指标、NDVI/FVC/LAI趋势/几何像元、天气与历史参照、质量缺失；没有卡片套卡片、折叠树或阅读弹层。

## 可下载PDF（不是打印对话框）

- 8份已生成的真实中文PDF，位于`public/biweekly-mock/`，每份3页、约70KB，字体子集嵌入，可检索中文。
- 页面上「下载详细PDF」为带download属性的真实静态文件链接；作物/期次切换匹配对应产物。详细PDF含指标、趋势、跨期解释、逐日天气、核查清单、缺失限制与快照/版本信息。
- 全部事实与网页同一fixture。文案为**预置规则Mock，未调用AI**，不是模型实时生成。FVC/LAI未验证，不能当真实农情或处方。
- `mock-pdf-manifest.json`含每个报告快照SHA256与PDF文件SHA256、页数、模板/模型标记。测试可阻止改fixture未更新PDF的漂移。`pdf-contract.ts`仅声明未来异步状态；当前没有队列、轮询、报告API或真实AI请求。
- 常规构建不需要Python或额外npm包。可选离线再生成：安装`reportlab==4.4.3`，准备允许嵌入的中文TrueType字体及poppler-utils，然后：
  ```sh
  python scripts/generate-biweekly-mock-pdfs.py --font /path/to/licensed-cjk.ttf
  ```
  脚本从Node24读取同一个fixture，以固定元数据生成；字体不作为独立文件新增到前端仓库。每份必须3页，否则失败。当前使用API仓库已有WenQuanYi Zen Hei字体做子集嵌入。

## 验证与边界

```sh
node --test src/lib/*.test.ts src/lib/biweekly/*.test.ts
npm run type-check
npm run lint
npm run build:test
git diff --check
```

涵盖日期比例/边界/月份、阶段/生育期连续性、报告位置/归属/唯一性、空状态/导航、原有首级页签、无树/弹层/API、PDF快照和文件哈希。另用pdfinfo/pdftotext检查全部PDF3页/中文文本，渲染示例页检查排版。

父代理浏览器QA：288/400/640px侧栏及宽屏；横滚与选点、短生育期、未来空期、跨期注记、前后导航、键盘、作物/指标切换、逐份真实下载与PDF中文。

所有数据、阶段日期与参照均为虚构。全局会话/真实业务地图原有网络行为保留。未改后端、数据库或生产配置；无实时AI、迁移、部署或合并。下一阶段后台边界与只读入口见`docs/biweekly-offline-backend-contract.md`。

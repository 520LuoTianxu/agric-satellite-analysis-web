# 双周报 Mock 界面预览

## 本地与部署

- 基于 `origin/master`，分支 `feat/biweekly-report-mock`。
- Node 24（现有 build:test 使用 Node --env-file），`npm ci`。
- 测试环境静态导出：`npm run build:test`，发布 `out/`，沿用项目现有的静态部署流程及 basePath。
- 本地：`npm run dev -- --port 3214`，打开 `/biweekly-demo`（默认中文）、`/en/biweekly-demo` 或 `/es/biweekly-demo`。原型内容有意中文优先，其他locale不会缺少翻译key导致崩溃。
- 配置 `NEXT_PUBLIC_BASE_PATH` 时，在上述路径之前添加该前缀。例如 `/agric/biweekly-demo`。
- 独立路由仅包含虚构数据，位于认证业务AppShell之外，空白浏览器无需登录/业务API即可预览；**全局 OrgAccessGuard 未修改**，已有被禁用组织标记仍会阻止此路由，不提供绕过。
- 正常登录的真实地块：`地块分析`顶部卡片打开相同阅读层。卡片明确提示为独立示例地块，未把真实 landId/cropType 作为Mock证据。

## 可体验

1. 右侧卡片打开宽阅读层；移动端全屏。Radix负责焦点锁定、Escape关闭和返回触发按钮。
2. 冬小麦/玉米和三期期次共六个确定性样本，可切换。
3. 章节锚点连续阅读，没有二级页签；FVC/NDVI/LAI切换会同时更新趋势和空间示意。
4. 历史天气、历史/周边比较、跨阶段分段、旱涝证据不足状态和可展开附录。
5. 所有值为Mock；FVC/LAI为未验证模型概念值，PSRI未启用。没有后端生成/PDF/导出假按钮。原生浏览器打印有Mock说明，但不代表实现了PDF服务。

## 数据与边界

`src/lib/biweekly/mock-report.ts` 为未来API adapter前的独立fixture契约。报告组件没有fetch、SWR或业务API调用。全局AuthProvider保留原有逻辑：空会话不调用业务报告API；若浏览器已有会话，既有会话校验仍可能执行，不承诺全站零网络。没有新增凭证/真实身份、修改组织策略、首级页签、菜单白名单、原有折叠分区或历史天气请求。

## 验证

```
node --test src/lib/*.test.ts src/lib/biweekly/*.test.ts
npm run type-check
npm run lint
npm run build:test
```

Mock测试验证场景数量、选择、时间区间、观测/卡片数值和降水一致性。尚需真实浏览器人工复核桌面/移动端的视觉、焦点、锚点、打印分页；静态构建和HTTP检查不替代视觉验收。

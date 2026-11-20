# 后续双周报后台逻辑契约（未对接、未实现）

## 当前边界（用户t32最新指示）

前端页面和PDF始终Mock。下一阶段可写下载机/接口后台逻辑与离线测试，但不得自动把前端切换到真实接口、调用AI、跑生产生成、迁移或部署。只有用户明确说「对接」才开始集成。本文的接口/状态为候选契约，不是已可调用服务。

## 事实与流程

1. **不可变snapshot**：地块与几何指纹、种植季/方案实例/作物组件ID、排期/阶段映射版本、[start,end)与Asia/Shanghai、主归属和跨期覆盖、输入场景/资产ID、掩膜/网格/计算/校准版本、遥感紧凑统计、历史天气、质量标志与缺失原因。修订生成新revision，不覆写历史快照。网页与PDF使用相同snapshot ID/SHA256。
2. **质量受控证据层**：每个事实有evidence_id、来源/时间/单位、质量与measured/estimated/mock属性。只向模型提供紧凑摘要，不发送像元大数组。缺失不填0，缺灌溉/墒情/足量Sentinel-1雷达不确定判灾；FVC/LAI未验证时保留明确限制或不提供结论，不能默认为可靠反演。
3. **AI结构化文案**：供应商/模型/费用待用户决定，不能静默选付费服务。输入冻结，输出按schema约束为summary/claims/actions/limitations；每条claim引用evidence_id。校验数字/单位/日期仅来自白名单事实或明确允许的计算，拒绝新增产量、灾损、概率、阈值或无证据断言。失败/缺证时模板降级并标明未生成AI解读，不伪造成功。
4. **PDF产物**：模板可比网页详细，但共同事实必须一致。记录snapshot/model/prompt/template/policy版本、证据指纹、文案校验结果、PDF SHA256/长度/语言/页数。下载地址与内部存储键分离，校验组织权限；签名地址到期可刷新但不改变快照。
5. **异步状态**：queued→running→ready或failed；unavailable表示没有匹配产物。ready必须携带可用artifact；failed带稳定error_code和可重试信息。幂等键建议snapshot_sha+template_version+language+approved_model_policy。先做离线队列/渲染逻辑，不发布任务、不启生产worker。

## 候选字段（非实际URL）

`ReportPdfJob { job_id, report_id, snapshot_id, snapshot_sha256, status, artifact_url?, artifact_sha256?, model_version?, prompt_version?, template_version, error_code? }`

将来可分别提供创建任务、查询任务、下载产物三类接口；路由与鉴权沿现有API规范确认。当前前端只有同形类型/状态文案，**没有fetch、轮询或生成请求**。

## 后续需向用户确认的实质缺口

- 首批作物、方案实例定位、跨期主归属最终业务规则、排期失效处理、证据最低发布条件。
- FVC端元与地面样本、LAI模型与完整波段/角度输入。未确认前不假定模型或精度。
- 天气来源、历史参照、灌溉/墒情、S1可用性和灾害证据门槛。
- 经批准的AI服务/模型、预算、数据出境/留存与失败降级策略。
- 下载机实际代码/运行环境、对象存储位置、产物保留期与审批部署窗口。

## 只读代码入口盘点（本地已有，不表示部署环境已验证）

API仓库：`/workspace/agric-satellite-analysis-api`。

- `services/ingest/app/reports/season_growth/pdf_render.py`：既有ReportLab中文PDF渲染。
- `services/ingest/app/reports/season_growth/{facts.py,materials.py,service.py}`：生育期报告事实/组装入口。
- `services/ingest/app/reports/season_growth/bailian.py`：既有百炼集成模块。仅确认代码存在，未读取凭证、未调用或选定其服务。
- `services/ingest/app/reports/land_assessment/{pdf_render.py,ai_analysis.py}`：选地报告渲染/分析代码；字体`fonts/wqy-zenhei.ttf`用于本次离线Mock PDF子集嵌入，未复制字体文件到前端。
- `services/ingest/app/tasks/{assessment_report.py,season_growth_report.py}`：任务入口；`services/api/app/reports/parcel_insights.py`与`services/api/app/services/report_urls.py`：既有报告/链接模块。
- `services/ingest/tests/{test_land_assessment_pdf.py,test_season_growth_pdf.py}`：PDF测试参考。
- `scripts/s1s2_parcel_oss_pg/`及`services/ingest/app/tasks/agri_lonlat.py`：遥感下载/像元链路候选入口；本轮未深入检查下载机器或修改代码。

后台阶段由父代理继续，当前任务没有改动以上仓库。

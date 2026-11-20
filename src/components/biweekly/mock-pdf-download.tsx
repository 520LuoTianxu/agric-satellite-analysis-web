"use client";
import { Download } from "lucide-react";
import type { MockReport } from "@/lib/biweekly/mock-report";
import manifest from "@/lib/biweekly/mock-pdf-manifest.json";
import { pdfAction } from "@/lib/biweekly/pdf-contract";
import s from "./mock-pdf-download.module.css";

export function MockPdfDownload({report}:{report:MockReport}) {
 const artifact=manifest.artifacts.find(item=>item.reportId===report.id);
 const action=pdfAction(artifact?{status:"ready",artifactUrl:artifact.url}:{status:"unavailable"});
 return <section className={s.download} aria-label="详细Mock PDF下载"><div><strong>详细PDF报告 <span>MOCK</span></strong><p>网页看原始数据，PDF看详细证据与预置解读。所有内容均为模拟，未调用AI。</p><small role="status">{artifact?`离线演示PDF已就绪 · ${artifact.pages}页 · 快照 ${artifact.snapshotSha256.slice(0,12)}`:"暂无匹配的演示产物"}</small></div>{action.downloadable&&artifact?<a href={`${process.env.NEXT_PUBLIC_BASE_PATH||""}${artifact.url}`} download={`${report.id}-biweekly-MOCK.pdf`}><Download size={14}/>{action.label}</a>:<button disabled>{action.label}</button>}</section>;
}

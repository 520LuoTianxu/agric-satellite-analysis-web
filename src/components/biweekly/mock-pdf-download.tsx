"use client";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MockReport } from "@/lib/biweekly/mock-report";
import manifest from "@/lib/biweekly/mock-pdf-manifest.json";
import { pdfAction } from "@/lib/biweekly/pdf-contract";
import s from "./mock-pdf-download.module.css";

export function MockPdfDownload({report}:{report:MockReport}) {
 const artifact=manifest.artifacts.find(item=>item.reportId===report.id);
 const action=pdfAction(artifact?{status:"ready",artifactUrl:artifact.url}:{status:"unavailable"});
 return <section className={s.download} aria-label="详细Mock PDF下载">
  <div><strong>详细PDF</strong><small role="status">{artifact?`${artifact.pages}页 · 预置解读，未调用AI`:"暂无匹配产物"}</small></div>
  {action.downloadable&&artifact?<Button variant="outline" size="sm" asChild className={s.action}><a href={`${process.env.NEXT_PUBLIC_BASE_PATH||""}${artifact.url}`} download={`${report.id}-biweekly-MOCK.pdf`}><Download size={13} aria-hidden="true"/>{action.label}</a></Button>:<Button variant="outline" size="sm" disabled>{action.label}</Button>}
 </section>;
}

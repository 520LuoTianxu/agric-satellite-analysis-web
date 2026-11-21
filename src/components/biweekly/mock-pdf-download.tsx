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
 return <div className={s.download} aria-label="详细Mock PDF下载">
  {action.downloadable&&artifact?<Button variant="ghost" size="sm" asChild className={s.action}><a href={`${process.env.NEXT_PUBLIC_BASE_PATH||""}${artifact.url}`} download={`${report.id}-biweekly-MOCK.pdf`} aria-label={`下载详细Mock PDF，${artifact.pages}页，预置文案，未调用AI`}><Download size={14} aria-hidden="true"/><span>{action.label}</span><small>{artifact.pages}页</small></a></Button>:<Button variant="ghost" size="sm" disabled>{action.label}</Button>}
 </div>;
}

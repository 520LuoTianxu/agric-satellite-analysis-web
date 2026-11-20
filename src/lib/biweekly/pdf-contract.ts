/** Contract only: no endpoint is called until the user explicitly requests integration. */
export type PdfJobStatus="queued"|"running"|"ready"|"failed"|"unavailable";
export interface ReportPdfJob {
 status:PdfJobStatus; snapshotId?:string; jobId?:string; artifactUrl?:string;
 artifactSha256?:string; templateVersion?:string; modelVersion?:string; errorCode?:string;
}
export function pdfAction(job:ReportPdfJob):{label:string;downloadable:boolean} {
 const validUrl=!!job.artifactUrl&&(/^https:\/\//.test(job.artifactUrl)||/^\/(?!\/)/.test(job.artifactUrl));
 const downloadable=job.status==="ready"&&validUrl;
 const labels:Record<PdfJobStatus,string>={queued:"PDF排队中",running:"PDF生成中",ready:"下载详细PDF",failed:"PDF生成失败",unavailable:"暂无可下载PDF"};
 return {label:job.status==="ready"&&!validUrl?"PDF产物暂不可用":labels[job.status],downloadable};
}

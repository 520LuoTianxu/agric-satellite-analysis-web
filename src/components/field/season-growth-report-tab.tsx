"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    seasonGrowthApi,
    jobsApi,
    type NdviJob,
} from "@/lib/api";
import { resolveCdfinanceCredentials } from "@/lib/auth/cdfinance";
import CropSelect from "@/components/field/crop-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
    AlertTriangle,
    CheckCircle2,
    Download,
    Loader2,
    Paperclip,
    RefreshCw,
    Sprout,
    X,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface SeasonGrowthReportTabProps {
    landId: string;
    groupId?: string | number | null;
}

export default function SeasonGrowthReportTab({
    landId,
    groupId,
}: SeasonGrowthReportTabProps) {
    const t = useTranslations("seasonGrowthReport");
    const [latest, setLatest] = useState<NdviJob | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [startDate, setStartDate] = useState(() => {
        const year = new Date().getFullYear();
        return `${year}-06-01`;
    });
    const [endDate, setEndDate] = useState(() => {
        const year = new Date().getFullYear();
        return `${year}-09-30`;
    });
    const [crop, setCrop] = useState("");
    const [label, setLabel] = useState("");
    const [files, setFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const stopPoll = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    const refreshMeta = useCallback(async () => {
        try {
            const job = await seasonGrowthApi.latestMeta(landId);
            setLatest(job);
            return job;
        } catch {
            setLatest(null);
            return null;
        } finally {
            setLoading(false);
        }
    }, [landId]);

    const startPoll = useCallback(
        (jobId: string) => {
            stopPoll();
            pollRef.current = setInterval(async () => {
                try {
                    const job = await jobsApi.get(jobId);
                    setLatest(job);
                    if (job.status === "succeeded") {
                        stopPoll();
                        setGenerating(false);
                        toast.success(t("generateDone"));
                    } else if (job.status === "failed") {
                        stopPoll();
                        setGenerating(false);
                        toast.error(job.error || t("generateFailed"));
                    }
                } catch {
                    /* 任务查询短暂失败时继续轮询，避免一次网络抖动中断报告状态更新。 */
                }
            }, 2000);
        },
        [stopPoll, t],
    );

    useEffect(() => {
        void refreshMeta();
        return stopPoll;
    }, [refreshMeta, stopPoll]);

    // 页签切换会卸载组件；重新进入时若任务仍在执行，需要自动恢复轮询。
    const latestJobId = latest?.id;
    const latestJobStatus = latest?.status;
    useEffect(() => {
        if (!latestJobId || !["pending", "running"].includes(latestJobStatus || "")) return;
        // 只依赖任务 ID 和状态，避免轮询每次更新任务对象时重复创建定时器。
        startPoll(latestJobId);
        return stopPoll;
    }, [latestJobId, latestJobStatus, startPoll, stopPoll]);

    const handleGenerate = async () => {
        if (!startDate || !endDate) {
            toast.error(t("datesRequired"));
            return;
        }
        setGenerating(true);
        try {
            let materialKeys: string[] = [];
            if (files.length) {
                setUploading(true);
                for (const file of files) {
                    const upload = await seasonGrowthApi.uploadMaterial(landId, file);
                    if (upload.key) materialKeys.push(upload.key);
                }
                setUploading(false);
            }

            const credentials = resolveCdfinanceCredentials(groupId);
            const job = await seasonGrowthApi.generate(landId, {
                start_date: startDate,
                end_date: endDate,
                crops: crop.trim() ? [crop.trim()] : [],
                label: label.trim() || undefined,
                material_keys: materialKeys,
                pull_data: true,
                // 登录后可直接复用农服凭据，用户无需再次填写 Token、groupId 或基地 ID。
                ...(credentials.token ? { cdfinance_token: credentials.token } : {}),
                ...(credentials.groupId ? { group_id: credentials.groupId } : {}),
                ...(credentials.hrBaseId ? { hr_base_id: credentials.hrBaseId } : {}),
            });
            setLatest(job);
            if (job.status === "succeeded") {
                setGenerating(false);
                toast.success(t("generateDone"));
                return;
            }
            if (job.status === "failed") {
                setGenerating(false);
                toast.error(job.error || t("generateFailed"));
                return;
            }
            toast.message(t("generateStarted"));
            startPoll(job.id);
        } catch (error: any) {
            setGenerating(false);
            setUploading(false);
            toast.error(error?.detail?.message || error?.message || t("generateFailed"));
        }
    };

    const handleDownload = async () => {
        setDownloading(true);
        try {
            await seasonGrowthApi.downloadLatest(landId);
        } catch (error: any) {
            toast.error(error?.message || t("downloadFailed"));
        } finally {
            setDownloading(false);
        }
    };

    const progress = latest?.progress_json || {};
    const oneLiner = progress.one_liner as string | undefined;
    const hasPdf = latest?.status === "succeeded" && Boolean(progress.object_key);
    const inFlight = generating || latest?.status === "pending" || latest?.status === "running";

    return (
        <div className="p-4 space-y-4">
            <div className="space-y-1">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Sprout className="h-4 w-4" />
                    {t("title")}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                    {t("description")}
                </p>
            </div>

            {loading ? (
                <Skeleton className="h-24 w-full" />
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <label className="text-xs space-y-1">
                            <span className="text-muted-foreground">{t("startDate")}</span>
                            <DatePicker value={startDate} onChange={setStartDate} />
                        </label>
                        <label className="text-xs space-y-1">
                            <span className="text-muted-foreground">{t("endDate")}</span>
                            <DatePicker value={endDate} onChange={setEndDate} />
                        </label>
                    </div>
                    <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">{t("cropOptional")}</span>
                        <CropSelect value={crop} onChange={setCrop} placeholder={t("selectCrop")} />
                    </div>
                    <label className="text-xs space-y-1 block">
                        <span className="text-muted-foreground">{t("labelOptional")}</span>
                        <Input
                            className="h-9"
                            value={label}
                            placeholder={t("labelPlaceholder")}
                            onChange={(event) => setLabel(event.target.value)}
                        />
                    </label>
                    <div className="text-xs space-y-1.5">
                        <span className="text-muted-foreground">{t("materials")}</span>
                        <input
                            ref={fileRef}
                            type="file"
                            multiple
                            className="hidden"
                            onChange={(event) => setFiles(Array.from(event.target.files || []))}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-9"
                                onClick={() => fileRef.current?.click()}
                            >
                                <Paperclip className="mr-1.5 h-4 w-4" />
                                {t("chooseFiles")}
                            </Button>
                            {files.length > 0 && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-9 px-2 text-muted-foreground"
                                    onClick={() => {
                                        setFiles([]);
                                        if (fileRef.current) fileRef.current.value = "";
                                    }}
                                >
                                    <X className="mr-1 h-3.5 w-3.5" />
                                    {t("clearFiles")}
                                </Button>
                            )}
                        </div>
                        {files.length > 0 && (
                            <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                                <li>{t("filesSelected", { count: files.length })}</li>
                                {files.slice(0, 4).map((file) => (
                                    <li key={file.name} className="truncate">
                                        {file.name}
                                    </li>
                                ))}
                                {files.length > 4 && <li>…</li>}
                            </ul>
                        )}
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {t("cdfinanceReuseHint")}
                    </p>

                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={handleGenerate} disabled={inFlight || uploading}>
                            {inFlight || uploading ? (
                                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                            ) : (
                                <RefreshCw className="h-4 w-4 mr-1.5" />
                            )}
                            {uploading
                                ? t("uploading")
                                : inFlight
                                  ? t("generating")
                                  : t("generate")}
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleDownload}
                            disabled={!hasPdf || downloading}
                        >
                            {downloading ? (
                                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                            ) : (
                                <Download className="h-4 w-4 mr-1.5" />
                            )}
                            {t("download")}
                        </Button>
                    </div>

                    {latest && (
                        <div className="rounded-lg border bg-card p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs text-muted-foreground">{t("status")}</span>
                                <Badge variant="secondary" className="text-xs">
                                    {latest.status === "succeeded" && (
                                        <CheckCircle2 className="h-3 w-3 mr-1 text-success" />
                                    )}
                                    {latest.status === "failed" && (
                                        <AlertTriangle className="h-3 w-3 mr-1 text-destructive" />
                                    )}
                                    {(latest.status === "pending" || latest.status === "running") && (
                                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                    )}
                                    {t(`status_${latest.status}` as any, { default: latest.status })}
                                </Badge>
                            </div>
                            {oneLiner && (
                                <p className="text-xs text-muted-foreground leading-relaxed">{oneLiner}</p>
                            )}
                            {latest.status === "failed" && latest.error && (
                                <p className="text-xs text-destructive">{latest.error}</p>
                            )}
                            {latest.finished_at && latest.status === "succeeded" && (
                                <p className="text-[11px] text-muted-foreground">
                                    {t("generatedAt", {
                                        time: new Date(latest.finished_at).toLocaleString(),
                                    })}
                                </p>
                            )}
                        </div>
                    )}

                    {!latest && <p className="text-xs text-muted-foreground">{t("empty")}</p>}

                    <div className="rounded-md bg-surface-2 p-3 text-[11px] text-muted-foreground leading-relaxed">
                        <p>{t("noteFacts")}</p>
                        <p>{t("noteLlm")}</p>
                    </div>
                </>
            )}
        </div>
    );
}

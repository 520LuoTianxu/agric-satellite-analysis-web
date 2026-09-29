"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    assessmentApi,
    landsApi,
    jobsApi,
    ApiError,
    type AssessmentDimensionKey,
    type AssessmentScorecard,
    type NdviJob,
} from "@/lib/api";
import { resolveCdfinanceCredentials } from "@/lib/auth/cdfinance";
import CropSelect from "@/components/field/crop-select";
import LandScorecardRadar from "@/components/charts/land-scorecard-radar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    CheckCircle2,
    Download,
    FileText,
    Hexagon,
    Loader2,
    RefreshCw,
    AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface LandReportTabProps {
    landId: string;
    groupId?: string | number | null;
    cropType?: string | null;
    onCropBound?: (cropKey: string) => void;
    onReportReady?: () => void;
}

type ScorecardState = "loading" | "empty" | "legacy" | "ready";

const AXIS_I18N: Record<AssessmentDimensionKey, string> = {
    crop: "axisCrop",
    soil: "axisSoil",
    vigor: "axisVigor",
    weather: "axisWeather",
    wet_safety: "axisWetSafety",
    drought_safety: "axisDroughtSafety",
};

function trafficKind(light?: string | null): "green" | "yellow" | "red" | null {
    if (light === "绿" || light === "green") return "green";
    if (light === "黄" || light === "yellow") return "yellow";
    if (light === "红" || light === "red") return "red";
    return null;
}

function lightBadgeClass(light?: string | null) {
    const kind = trafficKind(light);
    if (kind === "green") return "bg-success-subtle text-success";
    if (kind === "yellow") return "bg-warning-subtle text-warning";
    if (kind === "red") return "bg-danger-subtle text-danger";
    return "bg-surface-2 text-muted-foreground";
}

function errorCode(err: unknown): string | undefined {
    if (!(err instanceof ApiError)) return undefined;
    const d = err.detail as unknown;
    if (d && typeof d === "object" && "code" in d) {
        return String((d as { code: unknown }).code);
    }
    return undefined;
}

function lightLabel(
    t: (key: "lightGreen" | "lightYellow" | "lightRed") => string,
    light?: string | null,
    fallback?: string | null,
) {
    const kind = trafficKind(light);
    if (kind === "green") return t("lightGreen");
    if (kind === "yellow") return t("lightYellow");
    if (kind === "red") return t("lightRed");
    return fallback || "";
}


function isUsableCrop(raw: string | null | undefined): boolean {
    if (raw == null) return false;
    const s = String(raw).trim();
    if (!s) return false;
    const lower = s.toLowerCase();
    if (lower === "unknown" || lower === "-" || lower === "null" || lower === "undefined") {
        return false;
    }
    return true;
}

function isCropRequiredError(err: any): boolean {
    const d = err?.detail ?? err?.message;
    if (d && typeof d === "object" && d.code === "crop_required") return true;
    if (typeof d === "string" && d.includes("crop_required")) return true;
    return false;
}

export default function LandReportTab({ landId, groupId, cropType, onCropBound, onReportReady }: LandReportTabProps) {
    const t = useTranslations("landReportTab");
    const [latestState, setLatest] = useState<NdviJob | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [boundCrop, setBoundCrop] = useState(() => (isUsableCrop(cropType) ? String(cropType).trim() : ""));
    const [pickCrop, setPickCrop] = useState(() => (isUsableCrop(cropType) ? String(cropType).trim() : ""));
    const [years, setYears] = useState<number>(3);
    const [dateFrom, setDateFrom] = useState<string>("");
    const [scorecardValue, setScorecard] = useState<AssessmentScorecard | null>(null);
    const [scorecardValueState, setScorecardState] = useState<ScorecardState>("loading");
    const [generationSettingsOpen, setGenerationSettingsOpen] = useState(false);
    const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pollControllerRef = useRef<AbortController | null>(null);
    const currentLandIdRef = useRef(landId);
    currentLandIdRef.current = landId;
    const latestLandIdRef = useRef<string | null>(null);
    const scorecardLandIdRef = useRef<string | null>(null);
    const latestRequestVersionRef = useRef(0);
    const scorecardRequestVersionRef = useRef(0);
    // 异步结果只有在归属地块仍然一致时才能展示，防止切地块后旧报告闪现。
    const latest = latestLandIdRef.current === landId ? latestState : null;
    const scorecard = scorecardLandIdRef.current === landId ? scorecardValue : null;
    const scorecardState = scorecardLandIdRef.current === landId ? scorecardValueState : "loading";

    useEffect(() => {
        const next = isUsableCrop(cropType) ? String(cropType).trim() : "";
        setBoundCrop(next);
        if (next) setPickCrop(next);
    }, [cropType]);

    const refreshMeta = useCallback(async (signal?: AbortSignal) => {
        const requestVersion = ++latestRequestVersionRef.current;
        setLoading(true);
        try {
            const job = await assessmentApi.latestMeta(landId, signal);
            if (
                signal?.aborted
                || requestVersion !== latestRequestVersionRef.current
                || currentLandIdRef.current !== landId
            ) return null;
            latestLandIdRef.current = landId;
            setLatest(job);
            return job;
        } catch {
            if (
                !signal?.aborted
                && requestVersion === latestRequestVersionRef.current
                && currentLandIdRef.current === landId
            ) {
                latestLandIdRef.current = landId;
                setLatest(null);
            }
            return null;
        } finally {
            if (
                !signal?.aborted
                && requestVersion === latestRequestVersionRef.current
                && currentLandIdRef.current === landId
            ) setLoading(false);
        }
    }, [landId]);

    const refreshScorecard = useCallback(async (signal?: AbortSignal) => {
        const requestVersion = ++scorecardRequestVersionRef.current;
        try {
            const next = await assessmentApi.latestScorecard(landId, signal);
            if (
                signal?.aborted
                || requestVersion !== scorecardRequestVersionRef.current
                || currentLandIdRef.current !== landId
            ) return;
            scorecardLandIdRef.current = landId;
            setScorecard(next);
            setScorecardState("ready");
        } catch (err) {
            if (
                signal?.aborted
                || requestVersion !== scorecardRequestVersionRef.current
                || currentLandIdRef.current !== landId
            ) return;
            scorecardLandIdRef.current = landId;
            setScorecard(null);
            setScorecardState(errorCode(err) === "scorecard_unavailable" ? "legacy" : "empty");
        }
    }, [landId]);

    useEffect(() => {
        const metaController = new AbortController();
        const scorecardController = new AbortController();
        setGenerating(false);
        void refreshMeta(metaController.signal);
        void refreshScorecard(scorecardController.signal);
        return () => {
            metaController.abort();
            scorecardController.abort();
            if (pollRef.current) clearTimeout(pollRef.current);
            pollControllerRef.current?.abort();
            pollControllerRef.current = null;
        };
    }, [refreshMeta, refreshScorecard]);

    const assessmentJobId = latest?.id;
    const assessmentJobStatus = latest?.status;
    useEffect(() => {
        if (!assessmentJobId || !["pending", "running"].includes(assessmentJobStatus || "")) return;
        let cancelled = false;
        // 根据服务端任务状态恢复轮询，刷新或切换到首页后仍能自动展示完成的报告。
        const poll = async () => {
            if (cancelled) return;
            const controller = new AbortController();
            pollControllerRef.current = controller;
            try {
                const job = await jobsApi.get(assessmentJobId, controller.signal);
                if (
                    cancelled
                    || controller.signal.aborted
                    || currentLandIdRef.current !== landId
                ) return;
                latestLandIdRef.current = landId;
                setLatest(job);
                if (job.status === "succeeded") {
                    setGenerating(false);
                    toast.success(t("generateDone"));
                    void refreshScorecard();
                    // 报告完成后由地块页面跳转首页，并保留当前地块作为报告选择。
                    onReportReady?.();
                } else if (job.status === "failed" || job.status === "cancelled") {
                    setGenerating(false);
                    toast.error(job.error || t("generateFailed"));
                } else {
                    // 等本次网络请求结束后再预约下一次，避免服务端慢响应时并发查同一任务。
                    pollRef.current = setTimeout(() => void poll(), 2000);
                }
            } catch {
                if (
                    !cancelled
                    && !controller.signal.aborted
                    && currentLandIdRef.current === landId
                ) {
                    pollRef.current = setTimeout(() => void poll(), 2000);
                }
            } finally {
                if (pollControllerRef.current === controller) {
                    pollControllerRef.current = null;
                }
            }
        };
        void poll();
        return () => {
            cancelled = true;
            if (pollRef.current) clearTimeout(pollRef.current);
            pollRef.current = null;
            pollControllerRef.current?.abort();
            pollControllerRef.current = null;
        };
    }, [assessmentJobId, assessmentJobStatus, landId, onReportReady, refreshScorecard, t]);

    const runGenerate = async (cropKey?: string) => {
        setGenerating(true);
        try {
            const body: {
                crop_type?: string;
                date_from?: string;
                years?: number;
                pull_data: boolean;
                cdfinance_token?: string;
                group_id?: string;
                hr_base_id?: string;
            } = { pull_data: true };
            const credentials = resolveCdfinanceCredentials(groupId);
            if (cropKey) body.crop_type = cropKey;
            if (dateFrom.trim()) {
                body.date_from = dateFrom.trim();
            } else {
                body.years = years;
            }
            if (credentials.token) body.cdfinance_token = credentials.token;
            if (credentials.groupId) body.group_id = credentials.groupId;
            if (credentials.hrBaseId) body.hr_base_id = credentials.hrBaseId;
            const job = await assessmentApi.generate(landId, body);
            if (currentLandIdRef.current !== landId) return;
            if (cropKey) {
                setBoundCrop(cropKey);
                onCropBound?.(cropKey);
            }
            latestLandIdRef.current = landId;
            setLatest(job);
            if (job.status === "succeeded") {
                setGenerating(false);
                toast.success(t("generateDone"));
                void refreshScorecard();
                onReportReady?.();
                return;
            }
            if (job.status === "failed") {
                setGenerating(false);
                toast.error(job.error || t("generateFailed"));
                return;
            }
            toast.message(t("pullAndGenerateStarted"));
        } catch (e: any) {
            if (currentLandIdRef.current !== landId) return;
            setGenerating(false);
            if (isCropRequiredError(e)) {
                toast.error(t("cropRequired"));
                return;
            }
            toast.error(e?.detail?.message || e?.message || t("generateFailed"));
        }
    };

    const handleGenerate = async () => {
        const cropKey = isUsableCrop(pickCrop)
            ? pickCrop.trim()
            : isUsableCrop(boundCrop)
              ? boundCrop.trim()
              : "";
        if (!cropKey) {
            toast.error(t("cropRequired"));
            return;
        }
        // 参数确认后再关闭弹窗，避免用户因作物未填写而丢失当前配置。
        setGenerationSettingsOpen(false);
        await runGenerate(cropKey);
    };

    const handleBindOnly = async () => {
        if (!isUsableCrop(pickCrop)) {
            toast.error(t("cropRequired"));
            return;
        }
        try {
            const key = pickCrop.trim();
            await landsApi.update(landId, { crop_type: key });
            setBoundCrop(key);
            onCropBound?.(key);
            toast.success(t("cropBound"));
        } catch (e: any) {
            toast.error(e?.message || t("cropBindFailed"));
        }
    };

    const handleDownload = async () => {
        setDownloading(true);
        try {
            await assessmentApi.downloadLatest(landId);
        } catch (e: any) {
            toast.error(e?.message || t("downloadFailed"));
        } finally {
            setDownloading(false);
        }
    };

    const progress = latest?.progress_json || {};
    const score =
        scorecard?.overall.score ??
        (typeof progress.score === "number" ? (progress.score as number) : undefined);
    const grade = scorecard?.overall.grade ?? (progress.grade as string | undefined);
    const light = scorecard?.overall.light ?? (progress.light as string | undefined);
    const oneLiner =
        scorecard?.overall.one_liner ?? (progress.one_liner as string | undefined);
    const hasPdf = latest?.status === "succeeded" && Boolean(progress.object_key);
    const inFlight =
        generating || latest?.status === "pending" || latest?.status === "running";
    const needsCrop = !isUsableCrop(boundCrop);
    const reportActions = (
        <div className="rounded-lg border bg-card p-3 space-y-2">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
                {t("reportActionsHint")}
            </p>
            <div className="flex flex-wrap gap-2">
                <Button
                    type="button"
                    size="sm"
                    variant={hasPdf ? "outline" : "default"}
                    onClick={() => setGenerationSettingsOpen(true)}
                    disabled={inFlight}
                >
                    {inFlight ? (
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                        <RefreshCw className="h-4 w-4 mr-1.5" />
                    )}
                    {inFlight ? t("generating") : t("pullAndGenerate")}
                </Button>
                <Button
                    type="button"
                    size="sm"
                    // 已有可下载报告时，下载是当前主操作；生成按钮降级为次要操作，减少误触重新拉取。
                    variant={hasPdf ? "default" : "outline"}
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
        </div>
    );

    return (
        <div className="p-4 space-y-4">
            <div className="space-y-1">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    {t("title")}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                    {t("description")}
                </p>
            </div>

            {loading ? (
                <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-64 w-full" />
                </div>
            ) : (
                <>
                    {reportActions}

                    <Dialog open={generationSettingsOpen} onOpenChange={setGenerationSettingsOpen}>
                        <DialogContent className="sm:max-w-lg">
                            <DialogHeader>
                                <DialogTitle>{t("generationSettings")}</DialogTitle>
                                <DialogDescription>{t("generationSettingsDialogHint")}</DialogDescription>
                            </DialogHeader>
                    <div
                        className={`rounded-lg border p-3 space-y-3 ${
                            needsCrop
                                ? "border-warning/40 bg-warning-subtle"
                                : "border-border bg-card"
                        }`}
                    >
                        {needsCrop ? (
                            <p className="text-xs text-warning leading-relaxed">
                                {t("cropGateHint")}
                            </p>
                        ) : (
                            <p className="text-[11px] text-muted-foreground">
                                {t("boundCrop")}:{" "}
                                <span className="font-medium text-foreground">{boundCrop}</span>
                                {" · "}
                                {t("cropReselectHint")}
                            </p>
                        )}
                        <div className="space-y-1">
                            <span className="text-xs text-muted-foreground">{t("selectCrop")}</span>
                            <CropSelect
                                value={pickCrop}
                                onChange={setPickCrop}
                                placeholder={t("selectCrop")}
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <span className="text-xs text-muted-foreground">{t("historyWindow")}</span>
                            <div className="flex flex-wrap gap-1.5">
                                {[1, 2, 3, 5].map((y) => (
                                    <Button
                                        key={y}
                                        type="button"
                                        size="sm"
                                        variant={
                                            !dateFrom && years === y ? "default" : "outline"
                                        }
                                        className="h-7 px-2.5 text-xs"
                                        onClick={() => {
                                            setYears(y);
                                            setDateFrom("");
                                        }}
                                    >
                                        {t("yearsPreset", { years: y })}
                                    </Button>
                                ))}
                            </div>
                            <label className="text-xs space-y-1 block">
                                <span className="text-muted-foreground">{t("dateFromOptional")}</span>
                                <DatePicker
                                    value={dateFrom}
                                    max={new Date().toISOString().slice(0, 10)}
                                    onChange={setDateFrom}
                                />
                            </label>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                {dateFrom
                                    ? t("windowHintDateFrom", { dateFrom })
                                    : t("windowHintYears", { years })}
                            </p>
                        </div>
                        {needsCrop && (
                            <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant="outline" onClick={handleBindOnly}>
                                    {t("bindCrop")}
                                </Button>
                            </div>
                        )}
                    </div>

                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setGenerationSettingsOpen(false)}
                                >
                                    {t("cancelGeneration")}
                                </Button>
                                <Button
                                    type="button"
                                    onClick={handleGenerate}
                                    disabled={inFlight}
                                >
                                    {inFlight ? (
                                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                                    ) : (
                                        <RefreshCw className="h-4 w-4 mr-1.5" />
                                    )}
                                    {inFlight ? t("generating") : t("pullAndGenerate")}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    {scorecardState === "loading" ? (
                        <Skeleton className="h-64 w-full rounded-lg" />
                    ) : scorecard && scorecardState === "ready" ? (
                        <div className="rounded-lg border bg-card shadow-sm p-4 space-y-3">
                            <div className="space-y-1">
                                <h4 className="text-[15px] font-semibold flex items-center gap-2">
                                    <Hexagon className="h-4 w-4" />
                                    {t("chartTitle")}
                                </h4>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    {t("chartCaption")}
                                </p>
                            </div>

                            <div className="flex items-end gap-3">
                                <div
                                    className={`rounded-md px-3 py-2 text-center min-w-[4.5rem] ${lightBadgeClass(light)}`}
                                >
                                    <div className="text-2xl font-bold tabular-nums leading-none font-mono">
                                        {score}
                                    </div>
                                    <div className="text-[10px] font-semibold uppercase tracking-wider mt-1">
                                        {lightLabel(t, light, grade)}
                                    </div>
                                </div>
                                <div className="flex-1 space-y-1">
                                    <p className="text-xs font-medium">{t("overallScore")}</p>
                                    {oneLiner && (
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            {oneLiner}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {scorecard.ai_reference &&
                                typeof scorecard.ai_reference.score === "number" && (
                                <div className="rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-2 space-y-1">
                                    <div className="flex items-baseline gap-2 flex-wrap">
                                        <span className="text-xs font-medium">
                                            {t("aiReferenceScore")}
                                        </span>
                                        <span className="font-mono text-lg font-semibold tabular-nums">
                                            {scorecard.ai_reference.score}
                                        </span>
                                        {(scorecard.ai_reference.grade ||
                                            scorecard.ai_reference.light) && (
                                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                                {lightLabel(
                                                    t,
                                                    scorecard.ai_reference.light,
                                                    scorecard.ai_reference.grade,
                                                )}
                                            </span>
                                        )}
                                    </div>
                                    {scorecard.ai_reference.rationale && (
                                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                                            {scorecard.ai_reference.rationale}
                                        </p>
                                    )}
                                    <p className="text-[10px] font-medium text-amber-800 dark:text-amber-200">
                                        {scorecard.ai_reference.disclaimer ||
                                            t("aiReferenceDisclaimer")}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                                        {t("aiReferenceHint")}
                                    </p>
                                </div>
                            )}

                            <LandScorecardRadar scorecard={scorecard} />

                            <ul className="grid grid-cols-1 gap-2">
                                {scorecard.dimensions.map((d) => (
                                    <li
                                        key={d.key}
                                        className="flex items-center justify-between gap-2 rounded-lg border p-3"
                                    >
                                        <span className="text-xs">
                                            {t(AXIS_I18N[d.key])}
                                            {d.weight ? (
                                                <span className="text-muted-foreground"> · {d.weight}</span>
                                            ) : null}
                                        </span>
                                        <span className="font-mono text-sm font-medium tabular-nums">
                                            {t("scoreOutOf", { score: d.score })}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                {t("chartWeights")}
                            </p>
                        </div>
                    ) : (
                        <div className="rounded-lg border bg-card shadow-sm p-4 space-y-3">
                            <div className="rounded-lg border-2 border-dashed p-12 text-center space-y-2">
                                <Hexagon className="h-12 w-12 mx-auto text-muted-foreground" />
                                <p className="text-sm font-medium">
                                    {scorecardState === "legacy" ? t("legacyNoScorecard") : t("noScorecard")}
                                </p>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    {scorecardState === "legacy"
                                        ? t("legacyNoScorecardHint")
                                        : t("noScorecardHint")}
                                </p>
                            </div>
                        </div>
                    )}

                    {latest && (
                        <div className="rounded-lg border bg-card p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs text-muted-foreground">
                                    {t("status")}
                                </span>
                                <Badge variant="secondary" className="text-xs">
                                    {latest.status === "succeeded" && (
                                        <CheckCircle2 className="h-3 w-3 mr-1 text-success" />
                                    )}
                                    {latest.status === "failed" && (
                                        <AlertTriangle className="h-3 w-3 mr-1 text-destructive" />
                                    )}
                                    {(latest.status === "pending" ||
                                        latest.status === "running") && (
                                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                    )}
                                    {t(`status_${latest.status}` as any, {
                                        default: latest.status,
                                    })}
                                </Badge>
                            </div>

                            {typeof score === "number" && scorecardState !== "ready" && (
                                <div className="flex items-end gap-3 pt-1">
                                    <div
                                        className={`rounded-md px-3 py-2 text-center min-w-[4.5rem] ${lightBadgeClass(light)}`}
                                    >
                                        <div className="text-2xl font-bold tabular-nums leading-none font-mono">
                                            {score}
                                        </div>
                                        <div className="text-[10px] font-semibold uppercase tracking-wider mt-1">
                                            {grade || light || ""}
                                        </div>
                                    </div>
                                    {oneLiner && (
                                        <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                                            {oneLiner}
                                        </p>
                                    )}
                                </div>
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

                    {!latest && (
                        <p className="text-xs text-muted-foreground">{t("empty")}</p>
                    )}

                    <div className="rounded-md bg-surface-2 p-3 text-[11px] text-muted-foreground space-y-1 leading-relaxed">
                        <p>{t("noteVigor")}</p>
                        <p>{t("noteFlood")}</p>
                        <p>{t("noteArea")}</p>
                    </div>
                </>
            )}

        </div>
    );
}

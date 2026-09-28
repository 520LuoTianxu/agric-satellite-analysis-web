"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { weatherApi } from "@/lib/api";
import type { WeatherDaily, WeatherForecastDay, WeatherSummary } from "@/lib/api";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Loader2, RefreshCw, CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatLandAreaMu, isOversizedLand, resolveLandAreaMu } from "@/lib/land-schedule-filter";
import ForecastBar from "@/components/field/forecast-bar";
import WeatherChart from "@/components/charts/weather-chart";
import WaterBalanceChart from "@/components/charts/water-balance-chart";
import SoilMoistureGauge from "@/components/field/soil-moisture-gauge";

type RangeOption = "30d" | "90d" | "season" | "1y" | "2y" | "3y" | "5y" | "custom";

const MAX_WEATHER_HISTORY_YEARS = 5;

function formatDateInputValue(value: Date): string {
    // 与遥感面板沿用 UTC 日期口径，确保两条任务链在跨午夜时仍提交同一窗口。
    return value.toISOString().slice(0, 10);
}

function todayInputValue(): string {
    return formatDateInputValue(new Date());
}

function dateYearsAgo(years: number): string {
    const value = new Date();
    value.setFullYear(value.getFullYear() - years);
    return formatDateInputValue(value);
}

// 展示窗口和手动回填共用这组日期，预设年限与遥感页的最长历史范围保持一致。
function getDateRange(range: RangeOption, customStartDate: string): { start: string; end: string } {
    const end = new Date();
    const start = new Date();
    switch (range) {
        case "30d":
            start.setDate(end.getDate() - 30);
            break;
        case "90d":
            start.setDate(end.getDate() - 90);
            break;
        case "season":
            start.setDate(end.getDate() - 180);
            break;
        case "1y":
            start.setFullYear(end.getFullYear() - 1);
            break;
        case "2y":
            start.setFullYear(end.getFullYear() - 2);
            break;
        case "3y":
            start.setFullYear(end.getFullYear() - 3);
            break;
        case "5y":
            start.setFullYear(end.getFullYear() - MAX_WEATHER_HISTORY_YEARS);
            break;
        case "custom":
            return { start: customStartDate, end: formatDateInputValue(end) };
    }
    return {
        start: formatDateInputValue(start),
        end: formatDateInputValue(end),
    };
}

interface WeatherTabProps {
    landId: string;
    landAreaMu?: number | null;
    areaHa?: number | null;
}

export default function WeatherTab({ landId, landAreaMu = null, areaHa = null }: WeatherTabProps) {
    const t = useTranslations("weather");
    const areaMu = useMemo(() => resolveLandAreaMu(landAreaMu, areaHa), [areaHa, landAreaMu]);
    const oversizedLand = isOversizedLand(areaMu);

    const [range, setRange] = useState<RangeOption>("30d");
    const [customStartDate, setCustomStartDate] = useState(() => dateYearsAgo(2));
    const [loading, setLoading] = useState(true);
    const [backfilling, setBackfilling] = useState(false);
    const [fetchProgress, setFetchProgress] = useState(false);
    const [data, setData] = useState<WeatherDaily[]>([]);
    const [forecast, setForecast] = useState<WeatherForecastDay[]>([]);
    const [summary, setSummary] = useState<WeatherSummary | null>(null);

    const rangeOptions: { value: RangeOption; label: string }[] = useMemo(
        () => [
            { value: "30d", label: t("range30d") },
            { value: "90d", label: t("range90d") },
            { value: "season", label: t("rangeSeason") },
            { value: "1y", label: t("range1y") },
            { value: "2y", label: t("range2y") },
            { value: "3y", label: t("range3y") },
            { value: "5y", label: t("range5y") },
            { value: "custom", label: t("rangeCustom") },
        ],
        [t],
    );

    const selectedWindow = useMemo(
        () => getDateRange(range, customStartDate),
        [customStartDate, range],
    );

    const loadWeather = useCallback(async () => {
        setLoading(true);
        try {
            const { start, end } = selectedWindow;
            const res = await weatherApi.get(landId, start, end, true);
            setData(res.data);
            setForecast(res.forecast);
            setSummary(res.summary);
        } catch {
            // silent - empty state shown
        } finally {
            setLoading(false);
        }
    }, [landId, selectedWindow]);

    useEffect(() => {
        loadWeather();
    }, [loadWeather]);

    const handleBackfill = async () => {
        if (oversizedLand) {
            toast.error(t("landTooLargeWarning", { area: formatLandAreaMu(areaMu) }));
            return;
        }
        setBackfilling(true);
        setFetchProgress(true);
        try {
            // 手动天气拉取与当前展示窗口使用同一组起止日期，避免只补 90 天却
            // 让多年图表继续显示空白；自定义日期也会原样传给后端任务链路。
            await weatherApi.backfill(landId, {
                date_from: selectedWindow.start,
                date_to: selectedWindow.end,
            });
            toast.success(t("backfillStarted"));
            // Lightweight progress: silently reload a few times, then stop spinner
            let attempts = 0;
            const maxAttempts = 12;
            const { start, end } = selectedWindow;
            const poll = async () => {
                attempts += 1;
                try {
                    const res = await weatherApi.get(landId, start, end, true);
                    setData(res.data);
                    setForecast(res.forecast);
                    setSummary(res.summary);
                } catch {
                    /* ignore */
                }
                if (attempts >= maxAttempts) {
                    setFetchProgress(false);
                    return;
                }
                setTimeout(poll, 4000);
            };
            setTimeout(poll, 3000);
        } catch {
            toast.error(t("backfillFailed"));
            setFetchProgress(false);
        } finally {
            setBackfilling(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const hasWeatherContent = data.length > 0 || forecast.length > 0;

    return (
        <div className="space-y-4">
            {oversizedLand && (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-subtle px-3 py-2 text-xs text-warning">
                    <span>{t("landTooLargeWarning", { area: formatLandAreaMu(areaMu) })}</span>
                </div>
            )}
            {fetchProgress && (
                <div className="rounded-md border border-info/30 bg-info-subtle/60 px-2.5 py-2 flex items-center gap-2 text-[11px] text-info">
                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                    <span>{t("fetchingProgress")}</span>
                    <div className="ml-auto h-1.5 w-24 rounded-full bg-info/15 overflow-hidden">
                        <div className="h-full w-1/2 rounded-full bg-info animate-pulse" />
                    </div>
                </div>
            )}
            {/* Range selector */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1 rounded-lg border bg-surface-2 p-0.5">
                    {rangeOptions.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => setRange(opt.value)}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${range === opt.value
                                ? "bg-background shadow-sm text-foreground"
                                : "text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5">
                        <Label htmlFor="weather-start-date" className="text-[11px] text-muted-foreground whitespace-nowrap">
                            {t("startDate")}
                        </Label>
                        <Input
                            id="weather-start-date"
                            type="date"
                            value={customStartDate}
                            min={dateYearsAgo(MAX_WEATHER_HISTORY_YEARS)}
                            max={todayInputValue()}
                            disabled={range !== "custom"}
                            onChange={(event) => {
                                setCustomStartDate(event.target.value);
                                setRange("custom");
                            }}
                            className="h-8 w-[132px] text-xs"
                        />
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        onClick={() => { void handleBackfill(); }}
                        disabled={oversizedLand || backfilling || fetchProgress}
                        title={t("refresh")}
                    >
                        {backfilling || fetchProgress ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        {t("refresh")}
                    </Button>
                </div>
            </div>

            {hasWeatherContent ? (
                <>
            {/* Unified weather stats grid */}
            {summary && (() => {
                const latest = data.length > 0 ? data[data.length - 1] : null;
                const vpd = latest?.vapor_pressure_deficit;
                const vpdZone = vpd != null ? (vpd < 0.4 ? "low" : vpd < 0.8 ? "ideal" : vpd < 1.2 ? "moderate" : "high") : null;
                const vpdColor = vpdZone ? {
                    low: "text-info",
                    ideal: "text-success",
                    moderate: "text-caution",
                    high: "text-danger",
                }[vpdZone] : "";

                return (
                    <div className="grid grid-cols-4 gap-2">
                        {/* Row 1: Temp (2 cols) + Precip (2 cols) */}
                        <div className="col-span-2 rounded-lg border bg-card p-2.5 shadow-sm">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t("avgTemp")}</p>
                            <p className="text-lg font-bold leading-tight mt-0.5 tabular-nums text-sig-temp">
                                {summary.avg_temperature != null ? `${summary.avg_temperature.toFixed(1)}°C` : "-"}
                            </p>
                            {summary.min_temperature != null && summary.max_temperature != null && (
                                <p className="text-[10px] text-muted-foreground mt-0.5">{summary.min_temperature.toFixed(1)}° – {summary.max_temperature.toFixed(1)}°</p>
                            )}
                        </div>
                        <div className="col-span-2 rounded-lg border bg-card p-2.5 shadow-sm">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t("totalPrecip")}</p>
                            <p className="text-lg font-bold leading-tight mt-0.5 tabular-nums text-sig-precip">
                                {summary.total_precipitation != null ? `${summary.total_precipitation.toFixed(1)} mm` : "-"}
                            </p>
                        </div>

                        {/* Row 2: Water Deficit + GDD + Soil Moisture + Frost/Heat */}
                        <div className="col-span-2 rounded-lg border bg-card p-2.5 shadow-sm">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t("waterDeficit")}</p>
                            <p className={`text-lg font-bold leading-tight mt-0.5 tabular-nums ${summary.water_deficit_mm != null && summary.water_deficit_mm < 0 ? "text-danger" : "text-success"}`}>
                                {summary.water_deficit_mm != null ? `${summary.water_deficit_mm.toFixed(1)} mm` : "-"}
                            </p>
                        </div>
                        <div className="col-span-1 rounded-lg border bg-card p-2.5 shadow-sm">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t("gddCumulative")}</p>
                            <p className="text-lg font-bold leading-tight mt-0.5 tabular-nums text-sig-temp">
                                {summary.gdd_cumulative != null ? `${summary.gdd_cumulative.toFixed(0)}` : "-"}
                            </p>
                        </div>
                        <div className="col-span-1 rounded-lg border bg-card p-2.5 shadow-sm">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t("soilMoisture")}</p>
                            <p className="text-lg font-bold leading-tight mt-0.5 tabular-nums text-sig-water">
                                {summary.avg_soil_moisture_top != null ? `${(summary.avg_soil_moisture_top * 100).toFixed(0)}%` : "-"}
                            </p>
                        </div>

                        {/* Row 3: VPD (3 cols) + Frost + Heat */}
                        {vpd != null && vpdZone && (
                            <div className="col-span-2 rounded-lg border bg-card p-2.5 shadow-sm">
                                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">VPD</p>
                                <p className={`text-lg font-bold leading-tight mt-0.5 ${vpdColor}`}>{vpd.toFixed(2)} kPa</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">{t(`vpd${vpdZone.charAt(0).toUpperCase() + vpdZone.slice(1)}`)}</p>
                            </div>
                        )}
                        <div className="col-span-1 rounded-lg border bg-card p-2.5 shadow-sm">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t("frostDays")}</p>
                            <p className="text-lg font-bold leading-tight mt-0.5 tabular-nums text-info">
                                {summary.frost_days}
                            </p>
                        </div>
                        <div className="col-span-1 rounded-lg border bg-card p-2.5 shadow-sm">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t("heatStressDays")}</p>
                            <p className="text-lg font-bold leading-tight mt-0.5 tabular-nums text-danger">
                                {summary.heat_stress_days}
                            </p>
                        </div>
                    </div>
                );
            })()}

            {/* 7-day forecast */}
            {forecast.length > 0 && (
                <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        {t("forecast7d")}
                    </h4>
                    <ForecastBar forecast={forecast} />
                </div>
            )}

            {/* Temperature & Precipitation chart - in card */}
            <div className="rounded-lg border bg-card p-3 shadow-sm">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {t("tempAndPrecip")}
                </h4>
                <WeatherChart data={data} height={200} />
            </div>

            {/* ET₀ & Water Balance chart - in card */}
            <div className="rounded-lg border bg-card p-3 shadow-sm">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {t("waterBalanceTitle")}
                </h4>
                <WaterBalanceChart data={data} height={180} />
            </div>

            {/* Soil Moisture by Depth - in card */}
            {data.length > 0 && data[data.length - 1].soil_moisture_0_1cm != null && (
                <div className="rounded-lg border bg-card p-3 shadow-sm">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        {t("soilMoistureDepth")}
                    </h4>
                    <SoilMoistureGauge data={data[data.length - 1]} />
                </div>
            )}

            {/* Soil Temperature by Depth - in card */}
            {data.length > 0 && data[data.length - 1].soil_temperature_0cm != null && (
                <div className="rounded-lg border bg-card p-3 shadow-sm">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        {t("soilTempDepth")}
                    </h4>
                    <div className="space-y-1.5">
                        {([
                            { key: "soil_temperature_0cm" as const, label: t("soilTempSurface") },
                            { key: "soil_temperature_6cm" as const, label: t("soilTemp6cm") },
                            { key: "soil_temperature_18cm" as const, label: t("soilTemp18cm") },
                            { key: "soil_temperature_54cm" as const, label: t("soilTemp54cm") },
                        ] as const).map(({ key, label }) => {
                            const val = data[data.length - 1][key];
                            if (val == null) return null;
                            return (
                                <div key={key} className="flex items-center gap-2">
                                    <span className="text-[10px] text-muted-foreground w-16 shrink-0 text-right">
                                        {label}
                                    </span>
                                    <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden relative">
                                        <div
                                            className={`h-full rounded-full transition-[width,background-color] ${val > 30 ? "bg-danger" : val <= 0 ? "bg-info" : "bg-sig-temp"
                                                }`}
                                            style={{ width: `${Math.min(Math.max(((val + 10) / 50) * 100, 5), 100)}%` }}
                                        />
                                    </div>
                                    <span className="text-[10px] font-semibold w-12 shrink-0 text-right">
                                        {val.toFixed(1)}°C
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
                </>
            ) : (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                    <CloudOff className="h-8 w-8 text-muted-foreground/50" />
                    <div>
                        <p className="text-sm font-medium">{t("noWeatherData")}</p>
                        <p className="text-xs text-muted-foreground mt-1">{t("noWeatherDataDesc")}</p>
                    </div>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { void handleBackfill(); }}
                        disabled={oversizedLand || backfilling || fetchProgress}
                    >
                        {backfilling || fetchProgress ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <RefreshCw className="h-4 w-4 mr-2" />
                        )}
                        {t("fetchWeather")}
                    </Button>
                </div>
            )}
        </div>
    );
}

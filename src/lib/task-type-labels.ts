type Translate = (key: string) => string;

/**
 * 管理页统一使用业务语言展示任务类型；未知类型仍保留原值，避免新任务上线后丢失诊断信息。
 */
const TASK_TYPE_KEYS: Record<string, string> = {
    "overview_daily": "taskTypeOverviewDaily",
    "satellite_batch": "taskTypeSatelliteBatch",
    "satellite_analysis": "taskTypeSatelliteAnalysis",
    "satellite_download": "taskTypeSatelliteDownload",
    "assessment_report": "taskTypeAssessmentReport",
    "season_growth_report": "taskTypeSeasonGrowthReport",
    "land_bootstrap": "taskTypeLandBootstrap",
    "agri_optical": "taskTypeAgriOptical",
    "weather_backfill": "taskTypeWeatherBackfill",
    "soil_fetch": "taskTypeSoilFetch",
    "admin_task": "taskTypeAdminTask",
    "backfill": "taskTypeBackfill",
    "overview-refresh": "taskTypeOverviewRefresh",
    "daily-satellite": "taskTypeDailySatellite",
    "daily-weather": "taskTypeDailyWeather",
    "mysql-land-sync": "taskTypeMysqlLandSync",
    "ndvi": "taskTypeNdvi",
    "evi": "taskTypeEvi",
    "savi": "taskTypeSavi",
    "ndwi": "taskTypeNdwi",
    "ndmi": "taskTypeNdmi",
    "ndre": "taskTypeNdre",
    "cire": "taskTypeCire",
    "mndwi": "taskTypeMndwi",
    "s1": "taskTypeSentinel1",
    "s2": "taskTypeSentinel2",
};

export function taskTypeLabel(type: string, t: Translate) {
    const key = TASK_TYPE_KEYS[type];
    return key ? t(key) : type || t("taskTypeUnknown");
}


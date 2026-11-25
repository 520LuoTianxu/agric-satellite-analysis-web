/** 地块详情侧栏页签：默认长势分析，选地/生育期/收获放在「选地报告」，排在种植双周报后面。 */

export const FIELD_DETAIL_DEFAULT_TAB = "ndvi";
export const PARCEL_ANALYSIS_TAB = "parcel-analysis";

export const FIELD_DETAIL_VISIBLE_TABS = [
    "ndvi",
    "weather",
    "soil",
    "alerts",
    "biweekly",
    PARCEL_ANALYSIS_TAB,
] as const;

export const FIELD_DETAIL_HIDDEN_TABS = ["share", "scouting"] as const;

export const PARCEL_ANALYSIS_SECTIONS = ["land-report", "season-growth", "harvest"] as const;

export type FieldDetailVisibleTab = (typeof FIELD_DETAIL_VISIBLE_TABS)[number];
export type FieldDetailHiddenTab = (typeof FIELD_DETAIL_HIDDEN_TABS)[number];
export type FieldDetailTab = FieldDetailVisibleTab | FieldDetailHiddenTab;
export type ParcelAnalysisSection = (typeof PARCEL_ANALYSIS_SECTIONS)[number];

const VISIBLE_TAB_SET = new Set<string>(FIELD_DETAIL_VISIBLE_TABS);
const HIDDEN_TAB_SET = new Set<string>(FIELD_DETAIL_HIDDEN_TABS);
const SECTION_SET = new Set<string>(PARCEL_ANALYSIS_SECTIONS);

function isParcelAnalysisSection(value: string): value is ParcelAnalysisSection {
    return SECTION_SET.has(value);
}

/** 把 URL、引导或旧页签值解析成当前仍存在的页签。 */
export function resolveFieldDetailTab(raw?: string | null): FieldDetailTab {
    if (!raw) return FIELD_DETAIL_DEFAULT_TAB;
    if (isParcelAnalysisSection(raw)) return PARCEL_ANALYSIS_TAB;
    if (VISIBLE_TAB_SET.has(raw) || HIDDEN_TAB_SET.has(raw)) {
        return raw as FieldDetailTab;
    }
    return FIELD_DETAIL_DEFAULT_TAB;
}

/** 旧的独立页签或 ?section= 会落到「选地报告」里的对应分区。 */
export function resolveParcelAnalysisSection(
    tabRaw?: string | null,
    sectionRaw?: string | null,
): ParcelAnalysisSection {
    if (sectionRaw && isParcelAnalysisSection(sectionRaw)) return sectionRaw;
    if (tabRaw && isParcelAnalysisSection(tabRaw)) return tabRaw;
    return "land-report";
}

export function isParcelAnalysisTab(tab: string): boolean {
    return tab === PARCEL_ANALYSIS_TAB || isParcelAnalysisSection(tab);
}

/** 收获色膜只在收获分区展开（或仍落在旧 harvest 页签）时盖到地图上。 */
export function shouldShowHarvestMapOverlay(tab: string, harvestSectionOpen: boolean): boolean {
    return tab === "harvest" || (tab === PARCEL_ANALYSIS_TAB && harvestSectionOpen);
}

/** 写入或清掉 tab/section，保留 fieldId 等其它查询参数。 */
export function applyFieldDetailTabParams(
    searchParams: URLSearchParams,
    tab: string,
    section?: ParcelAnalysisSection | null,
): void {
    const canonical = resolveFieldDetailTab(tab);
    if (canonical === FIELD_DETAIL_DEFAULT_TAB) {
        searchParams.delete("tab");
    } else {
        searchParams.set("tab", canonical);
    }

    if (canonical === PARCEL_ANALYSIS_TAB) {
        const nextSection = section && isParcelAnalysisSection(section) ? section : "land-report";
        if (nextSection === "land-report") searchParams.delete("section");
        else searchParams.set("section", nextSection);
        return;
    }

    searchParams.delete("section");
}

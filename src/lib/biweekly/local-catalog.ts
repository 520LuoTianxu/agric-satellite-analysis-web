/** Static 6417 2025/26 catalog for local demo. Not a live production query. */
import catalog from "./local-catalog.json";
import type { BiweeklyLatestJob } from "./job-display";

export interface LocalPeriod {
 period_id: string;
 issue: number;
 start: string;
 end_inclusive: string;
 end_exclusive: string;
 days: number;
 partial: boolean;
 optical_descriptive_days: number;
 s1_products: number;
 has_eligible_optics: boolean;
 label: string;
 latest_job?: BiweeklyLatestJob | null;
}
export interface LocalSeason {
 land_id: string;
 land_name: string;
 season_id: string;
 label: string;
 crop: string;
 crop_name: string;
 start: string;
 end_inclusive: string;
 end_exclusive: string;
 cadence_days: number;
 auto_publish: boolean;
 note: string;
 periods: LocalPeriod[];
}

export const LOCAL_LAND_ID = "6417";
export const LOCAL_SEASONS: LocalSeason[] = (catalog.seasons as LocalSeason[]).filter(
 season => season.crop === "winter_wheat" && season.land_id === LOCAL_LAND_ID
);

export function getLocalSeason(seasonId = "2025/26"): LocalSeason {
 const season = LOCAL_SEASONS.find(item => item.season_id === seasonId);
 if (!season) throw new RangeError(`Unknown local season: ${seasonId}`);
 return season;
}

export function getLocalPeriod(seasonId: string, periodId: string): LocalPeriod | undefined {
 return getLocalSeason(seasonId).periods.find(item => item.period_id === periodId);
}

export function adjacentPeriod(season: LocalSeason, periodId: string, direction: -1 | 1): LocalPeriod | undefined {
 const index = season.periods.findIndex(item => item.period_id === periodId);
 if (index < 0) return undefined;
 return season.periods[index + direction];
}

export function isMaizeCrop(cropType?: string | null): boolean {
  const value = (cropType || "").trim().toLowerCase();
  if (!value) return false;
  return value.includes("maize") || value.includes("corn") || value.includes("玉米");
}

/** 遥感说明面板使用的稳定指标键；面向用户的文案统一放在多语言 messages 中。 */
export const REMOTE_SENSING_KEYS = [
    "ndvi",
    "evi",
    "savi",
    "ndwi",
    "ndmi",
    "ndre",
    "cire",
    "mndwi",
    "vv",
    "vh",
    "drought",
    "flood",
    "sentinel2",
    "sentinel1",
] as const;

export type RemoteSensingKey = (typeof REMOTE_SENSING_KEYS)[number];

const REMOTE_SENSING_KEY_SET = new Set<string>(REMOTE_SENSING_KEYS);

/** 兼容图层使用的大写缩写和农业面板的小写缩写，未知值回退到 NDVI。 */
export function getRemoteSensingKey(value?: string | null): RemoteSensingKey {
    const key = value?.toLowerCase();
    return key && REMOTE_SENSING_KEY_SET.has(key) ? (key as RemoteSensingKey) : "ndvi";
}

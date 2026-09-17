"use client";

import useSWR from "swr";
import { useAuth } from "@/components/auth-provider";
import { alertsApi } from "@/lib/api";
import { getAlertSession } from "@/lib/alert-session";

/** 导航和预警页共享统计请求，按登录凭证与基地隔离缓存。 */
export function useAlertSummary() {
    const { session, switching } = useAuth();
    const scope = session && !switching ? getAlertSession() : null;
    const result = useSWR(
        scope ? ["alert-summary", scope.baseId, scope.token] : null,
        () => alertsApi.summary(),
        { refreshInterval: 60_000, keepPreviousData: false },
    );
    return result;
}

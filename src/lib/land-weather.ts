/**
 * Build the land weather query path.
 *
 * The optional 4th argument is kept so existing `weatherApi.get` call sites
 * still type-check, but the path always requests historical observations
 * only (`include_forecast=false`). Forecast days are no longer fetched
 * from this endpoint.
 */
export function buildLandWeatherPath(
    landId: string,
    startDate: string,
    endDate: string,
    _includeForecast = false,
): string {
    return `/lands/${landId}/weather?start_date=${startDate}&end_date=${endDate}&include_forecast=false`;
}

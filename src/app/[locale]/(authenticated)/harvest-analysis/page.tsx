"use client";

import React, { Suspense } from "react";
import { HarvestAnalysisPage } from "@/components/project-harvest/harvest-analysis-page";
import { Skeleton } from "@/components/ui/skeleton";

export default function Page() {
    return <Suspense fallback={<Skeleton className="h-full w-full" />}><HarvestAnalysisPage /></Suspense>;
}

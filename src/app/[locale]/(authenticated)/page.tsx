"use client";

import { Suspense } from "react";
import LandReportsHome from "@/components/field/land-reports-home";
import { Loader2 } from "lucide-react";

export default function HomePage() {
    return <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="h-5 w-5 animate-spin" /></div>}><LandReportsHome /></Suspense>;
}

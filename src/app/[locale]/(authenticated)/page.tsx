"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

export default function HomeRedirectPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace("/overview");
    }, [router]);
    return null;
}

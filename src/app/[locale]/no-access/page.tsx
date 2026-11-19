import type { Metadata } from "next";
import { NoAccessPage } from "@/components/no-access-page";

export const metadata: Metadata = {
    robots: { index: false, follow: false, nocache: true },
};

export default function NoAccessRoutePage() {
    return <NoAccessPage />;
}

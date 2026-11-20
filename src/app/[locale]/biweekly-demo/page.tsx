import type { Metadata } from "next";
import { MockReportDemo } from "@/components/biweekly/mock-report";

export const metadata: Metadata = {
 title: "双周报 Mock 界面预览",
 robots: { index: false, follow: false },
};
/** Synthetic-only public preview; global OrgAccessGuard remains in force. */
export default function BiweeklyDemoPage() { return <MockReportDemo/>; }

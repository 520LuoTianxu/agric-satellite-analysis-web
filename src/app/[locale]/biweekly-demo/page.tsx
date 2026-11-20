import type { Metadata } from "next";
import BiweeklyTab from "@/components/biweekly/biweekly-tab";

export const metadata: Metadata = {
 title: "双周报 Mock 界面预览",
 robots: { index: false, follow: false },
};
/** Synthetic-only public preview; global OrgAccessGuard remains in force. */
export default function BiweeklyDemoPage() { return <main style={{maxWidth:640,margin:"24px auto",padding:16}}><BiweeklyTab /></main>; }

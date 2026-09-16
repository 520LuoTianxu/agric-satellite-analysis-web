import type { Metadata } from "next";
import { LoginPage } from "@/components/login-page";

export const metadata: Metadata = {
    robots: { index: false, follow: false, nocache: true },
};

export default function LoginRoutePage() {
    return <LoginPage />;
}

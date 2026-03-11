"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getToken } from "@/lib/api";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token && pathname !== "/login") {
      router.replace("/login");
      return;
    }

    if (token && pathname === "/login") {
      router.replace("/");
      return;
    }

    setReady(true);
  }, [pathname, router]);

  if (!ready) {
    return <div className="loading-screen">Loading Meteria...</div>;
  }

  return <>{children}</>;
}

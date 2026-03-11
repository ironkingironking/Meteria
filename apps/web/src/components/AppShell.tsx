"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearToken } from "@/lib/api";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/buildings", label: "Buildings" },
  { href: "/meters", label: "Meters" },
  { href: "/billing", label: "Billing" },
  { href: "/admin", label: "Admin" }
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-dot" />
          <div>
            <h1>Meteria</h1>
            <p>Metering Platform</p>
          </div>
        </div>

        <nav>
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={pathname === item.href ? "active" : ""}>
              {item.label}
            </Link>
          ))}
        </nav>

        <button
          className="ghost"
          onClick={() => {
            clearToken();
            router.replace("/login");
          }}
        >
          Sign out
        </button>
      </aside>

      <main className="content">{children}</main>
    </div>
  );
}

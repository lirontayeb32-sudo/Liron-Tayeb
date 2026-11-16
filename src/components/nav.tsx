"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "היום", icon: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/leads", label: "לידים", icon: "M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21a8 8 0 0 1 16 0" },
  { href: "/import", label: "ייבוא", icon: "M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3" },
  { href: "/profit", label: "רווח", icon: "M4 20V10m6 10V4m6 16v-7m4 7H2" },
  { href: "/settings", label: "עוד", icon: "M5 12h.01M12 12h.01M19 12h.01" },
];

export function Nav() {
  const pathname = usePathname();
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <>
      {/* desktop */}
      <header className="sticky top-0 z-20 hidden border-b border-slate-200 bg-white md:block">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-2">
          <Link href="/" className="text-lg font-bold text-brand-700">
            תכלת תיירות
          </Link>
          <nav aria-label="ניווט ראשי" className="flex gap-1">
            {ITEMS.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                aria-current={active(i.href) ? "page" : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${active(i.href) ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-100"}`}
              >
                {i.label === "עוד" ? "הגדרות" : i.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      {/* mobile bottom tab bar */}
      <nav aria-label="ניווט ראשי" className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden">
        <ul className="grid grid-cols-5">
          {ITEMS.map((i) => (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={active(i.href) ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${active(i.href) ? "text-brand-700" : "text-slate-500"}`}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active(i.href) ? 2.4 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={i.icon} />
                </svg>
                {i.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

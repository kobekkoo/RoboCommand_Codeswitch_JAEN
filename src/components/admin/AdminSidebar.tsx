"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AudioLines,
  BarChart3,
  ClipboardCheck,
  Database,
  FlaskConical,
  GitCompare,
  Home,
  ListChecks,
  Menu,
  Microscope,
  Settings,
  SlidersHorizontal,
  Stethoscope,
  TestTube2,
} from "lucide-react";
import { cn } from "@/lib/cn";

const primaryLinks = [
  { href: "/admin", label: "Home", icon: Home, exact: true },
  { href: "/admin/recipes", label: "Recipes", icon: ListChecks },
  { href: "/admin/review", label: "Review", icon: ClipboardCheck },
  { href: "/admin/flywheel", label: "Flywheel", icon: BarChart3 },
  { href: "/consent", label: "Contributor Tool", icon: AudioLines },
];

const evalLinks = [
  { href: "/admin/evaluations/datasets", label: "Datasets", icon: Database },
  { href: "/admin/evaluations/playground", label: "Playground", icon: FlaskConical },
  { href: "/admin/evaluations", label: "Experiments", icon: TestTube2, exact: true },
  { href: "/admin/evaluations/compare", label: "Compare", icon: GitCompare },
  { href: "/admin/evaluations/scorers", label: "Scorers", icon: SlidersHorizontal },
  { href: "/admin/evaluations/models", label: "Models", icon: Microscope },
  { href: "/admin/evaluations/providers", label: "Providers", icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <>
      <details className="fixed left-3 top-3 z-40 lg:hidden">
        <summary className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-md border border-border bg-white shadow-sm">
          <Menu className="h-5 w-5" />
        </summary>
        <div className="mt-2 w-72 rounded-lg border border-border bg-white p-3 shadow-lg">
          <SidebarContent pathname={pathname} compact />
        </div>
      </details>
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r border-border bg-white lg:block">
        <SidebarContent pathname={pathname} />
      </aside>
    </>
  );
}

function SidebarContent({ pathname, compact = false }: { pathname: string; compact?: boolean }) {
  return (
    <div className={cn("flex h-full flex-col", !compact && "px-4 py-5")}>
      <div className="mb-5 px-2">
        <Link href="/admin" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-sm text-white">CL</span>
          <span>CommandLoop</span>
        </Link>
        <p className="mt-2 text-xs text-zinc-500">Audio data flywheel and STT eval studio</p>
      </div>

      <nav className="space-y-6 text-sm">
        <NavGroup title="Operations" pathname={pathname} links={primaryLinks} />
        <NavGroup title="Eval Studio" pathname={pathname} links={evalLinks} />
      </nav>

      <div className="mt-auto hidden rounded-md border border-border bg-muted p-3 text-xs text-zinc-600 lg:block">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <Stethoscope className="h-4 w-4" />
          Current project
        </div>
        <p className="mt-1">CommandLoop robotics speech data</p>
      </div>
    </div>
  );
}

function NavGroup({
  title,
  pathname,
  links,
}: {
  title: string;
  pathname: string;
  links: Array<{ href: string; label: string; icon: typeof Home; exact?: boolean }>;
}) {
  return (
    <div>
      <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-normal text-zinc-500">{title}</p>
      <div className="space-y-1">
        {links.map((link) => {
          const active = link.exact ? pathname === link.href : pathname === link.href || pathname.startsWith(`${link.href}/`);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-2 transition hover:bg-muted",
                active ? "bg-muted font-medium text-foreground" : "text-zinc-700",
              )}
            >
              <Icon className="h-4 w-4" />
              {link.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

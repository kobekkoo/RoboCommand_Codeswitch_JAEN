import Link from "next/link";
import { AdminSessionPrompt } from "@/components/admin/AdminSessionPrompt";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { cn } from "@/lib/cn";

export function PublicShell({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <main className={cn("mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6", compact && "max-w-3xl")}>
      <header className="mb-8 flex items-center justify-between gap-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          CommandLoop
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/consent" className="text-zinc-700 hover:text-foreground">
            Start recording
          </Link>
          <Link href="/instructions" className="text-zinc-700 hover:text-foreground">
            Instructions
          </Link>
          <Link href="/admin/login" className="text-zinc-700 hover:text-foreground">
            Admin
          </Link>
        </nav>
      </header>
      {children}
    </main>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen w-full flex-1 bg-[#f8f8f6]">
      <AdminSidebar />
      <section className="min-w-0 flex-1 px-4 py-4 lg:px-6">
        <header className="mb-4 flex flex-col gap-2 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link href="/admin" className="text-lg font-semibold tracking-tight">
              CommandLoop Admin
            </Link>
            <p className="mt-1 text-sm text-zinc-600">Review, evaluate, and improve command data collection.</p>
          </div>
        </header>
        <AdminSessionPrompt />
        <div className="mx-auto w-full max-w-[1600px]">{children}</div>
      </section>
    </main>
  );
}

import Link from "next/link";
import { cn } from "@/lib/cn";

export function EvaluationSubnav({
  active,
  compareHref = "/admin/evaluations/compare",
}: {
  active: "datasets" | "playground" | "experiments" | "compare";
  compareHref?: string;
}) {
  const linkClass = (selected: boolean) =>
    cn(
      "rounded-md border px-3 py-2 text-sm font-medium",
      selected ? "border-accent bg-accent text-white" : "border-border bg-white text-foreground hover:bg-muted",
    );

  return (
    <nav className="mb-5 flex flex-wrap gap-2" aria-label="Evaluation views">
      <Link href="/admin/evaluations/datasets" className={linkClass(active === "datasets")}>
        Datasets
      </Link>
      <Link href="/admin/evaluations/playground" className={linkClass(active === "playground")}>
        Playground
      </Link>
      <Link href="/admin/evaluations" className={linkClass(active === "experiments")}>
        Experiments
      </Link>
      <Link href={compareHref} className={linkClass(active === "compare")}>
        Compare
      </Link>
    </nav>
  );
}

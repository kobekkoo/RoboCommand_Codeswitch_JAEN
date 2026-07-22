export function adminDataErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (message.includes("Could not find the table") || message.includes("schema cache")) {
    return [
      "Supabase schema migration is required before this can be saved.",
      "Run supabase/migrations/202607180002_braintrust_eval_flow.sql in the Supabase SQL Editor, then refresh this page.",
      `Original error: ${message}`,
    ].join(" ");
  }
  return message;
}

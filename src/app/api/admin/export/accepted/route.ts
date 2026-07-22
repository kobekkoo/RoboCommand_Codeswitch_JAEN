import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { exportAcceptedRows } from "@/lib/data/repository";

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET(request: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const format = new URL(request.url).searchParams.get("format") ?? "csv";
  const rows = await exportAcceptedRows();
  if (format === "jsonl") {
    return new Response(rows.map((row) => JSON.stringify(row)).join("\n"), {
      headers: {
        "content-type": "application/x-ndjson",
        "content-disposition": "attachment; filename=commandloop-accepted.jsonl",
      },
    });
  }
  const headers = Object.keys(rows[0] ?? { recordingId: "" });
  const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header as keyof typeof row])).join(","))].join("\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv",
      "content-disposition": "attachment; filename=commandloop-accepted.csv",
    },
  });
}

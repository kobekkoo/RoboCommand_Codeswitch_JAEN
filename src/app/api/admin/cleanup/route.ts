import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { cleanupAbandonedUploads } from "@/lib/data/repository";

export async function POST() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json({ removed: await cleanupAbandonedUploads() });
}

import { NextResponse } from "next/server";
import { getCurrentAdminSessionStatus, setAdminCookie } from "@/lib/auth";

export async function GET() {
  const session = await getCurrentAdminSessionStatus();
  if (!session.valid) {
    return NextResponse.json({ valid: false }, { status: 401 });
  }

  return NextResponse.json(await setAdminCookie());
}

export async function POST() {
  const session = await getCurrentAdminSessionStatus();
  if (!session.valid) {
    return NextResponse.json({ valid: false }, { status: 401 });
  }

  const refreshed = await setAdminCookie();
  return NextResponse.json(refreshed);
}

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { setAdminCookie } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { adminLoginSchema } from "@/lib/validators";

function safePasswordEqual(input: string, expected: string) {
  const left = Buffer.from(input);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const parsed = adminLoginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !safePasswordEqual(parsed.data.password, getEnv().ADMIN_PASSWORD)) {
    return NextResponse.json({ error: "Invalid password." }, { status: 401 });
  }
  await setAdminCookie();
  return NextResponse.json({ ok: true });
}

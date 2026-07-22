import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { getReviewQueue, saveReview } from "@/lib/data/repository";
import { reviewDecisionSchema } from "@/lib/validators";

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json({ items: await getReviewQueue() });
}

export async function POST(request: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const parsed = reviewDecisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid review." }, { status: 400 });
  }
  try {
    return NextResponse.json({ review: await saveReview(parsed.data) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save review." }, { status: 400 });
  }
}

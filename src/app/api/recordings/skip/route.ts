import { NextResponse } from "next/server";
import { skipAssignment } from "@/lib/data/repository";
import { skipAssignmentSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const parsed = skipAssignmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Skip reason is required." }, { status: 400 });
  }
  try {
    const assignment = await skipAssignment(parsed.data);
    return NextResponse.json({ assignment });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not skip prompt." }, { status: 400 });
  }
}

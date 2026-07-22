import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { createFollowUpRecipeFromSlices } from "@/lib/data/repository";

export async function POST(request: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as {
    runId?: string;
    sliceKeys?: string[];
    name?: string;
    targetAcceptedRecordings?: number;
    promptsPerSession?: number;
    contributorInstructions?: string;
    followUpNotes?: string;
  } | null;
  if (!body?.runId || !body.sliceKeys?.length) {
    return NextResponse.json({ error: "runId and selected slices are required." }, { status: 400 });
  }
  try {
    return NextResponse.json({
      recipe: await createFollowUpRecipeFromSlices(body.runId, body.sliceKeys, {
        name: body.name,
        targetAcceptedRecordings: body.targetAcceptedRecordings,
        promptsPerSession: body.promptsPerSession,
        contributorInstructions: body.contributorInstructions,
        followUpNotes: body.followUpNotes,
      }),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create follow-up." }, { status: 400 });
  }
}

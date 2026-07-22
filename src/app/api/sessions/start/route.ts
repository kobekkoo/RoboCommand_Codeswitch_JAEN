import { NextResponse } from "next/server";
import { getContributorCookie, setContributorCookie } from "@/lib/auth";
import { createOrResumeSession, getOrCreateContributor } from "@/lib/data/repository";
import { sessionSetupSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const parsed = sessionSetupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Session setup is invalid." }, { status: 400 });
  }

  try {
    const contributor = await getOrCreateContributor(await getContributorCookie());
    await setContributorCookie(contributor.id);
    const session = await createOrResumeSession({ contributorId: contributor.id, ...parsed.data });
    return NextResponse.json({ sessionId: session.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create session." }, { status: 400 });
  }
}

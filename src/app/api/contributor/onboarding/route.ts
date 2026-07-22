import { NextResponse } from "next/server";
import { getContributorCookie, setContributorCookie } from "@/lib/auth";
import { getOrCreateContributor, updateContributorProfile } from "@/lib/data/repository";
import { onboardingSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const parsed = onboardingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Onboarding fields are invalid." }, { status: 400 });
  }

  const contributor = await getOrCreateContributor(await getContributorCookie());
  await updateContributorProfile(contributor.id, parsed.data);
  await setContributorCookie(contributor.id);
  return NextResponse.json({ contributorId: contributor.id });
}

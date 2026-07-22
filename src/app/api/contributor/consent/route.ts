import { NextResponse } from "next/server";
import { getContributorCookie, setContributorCookie } from "@/lib/auth";
import { getOrCreateContributor, recordContributorConsent } from "@/lib/data/repository";
import { consentSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const parsed = consentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Consent checkbox is required." }, { status: 400 });
  }

  const contributor = await getOrCreateContributor(await getContributorCookie());
  await recordContributorConsent(contributor.id);
  await setContributorCookie(contributor.id);
  return NextResponse.json({ contributorId: contributor.id });
}

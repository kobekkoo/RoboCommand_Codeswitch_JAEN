import { NextResponse } from "next/server";
import { getContributorCookie } from "@/lib/auth";
import { withdrawContributor } from "@/lib/data/repository";

export async function POST() {
  const contributorId = await getContributorCookie();
  if (!contributorId) return NextResponse.json({ error: "Contributor session not found." }, { status: 404 });
  try {
    return NextResponse.json({ contributor: await withdrawContributor(contributorId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Withdrawal failed." }, { status: 400 });
  }
}

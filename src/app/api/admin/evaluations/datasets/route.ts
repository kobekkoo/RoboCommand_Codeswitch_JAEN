import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { adminDataErrorMessage } from "@/lib/data/errors";
import { createEvalDataset, publicSnapshot } from "@/lib/data/repository";
import { evalDatasetCreateSchema } from "@/lib/validators";

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json((await publicSnapshot()).evalDatasets);
}

export async function POST(request: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const parsed = evalDatasetCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid eval dataset." }, { status: 400 });
  }
  try {
    return NextResponse.json({ dataset: await createEvalDataset(parsed.data) });
  } catch (error) {
    return NextResponse.json({ error: adminDataErrorMessage(error, "Could not create eval dataset.") }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { buildDatasetPackage } from "@/lib/data/dataset-package";

export async function GET(request: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const recipeId = new URL(request.url).searchParams.get("recipeId");
  if (!recipeId) return NextResponse.json({ error: "recipeId is required." }, { status: 400 });
  try {
    const pkg = await buildDatasetPackage(recipeId);
    return new Response(JSON.stringify(pkg, null, 2), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename=commandloop-dataset-package-${recipeId}.json`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not export dataset package." }, { status: 400 });
  }
}

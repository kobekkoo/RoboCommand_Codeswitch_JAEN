import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import {
  activateRecipe,
  addPromptToRecipe,
  archiveRecipe,
  cloneRecipe,
  createRecipe,
  publicSnapshot,
  updatePrompt,
  updateRecipe,
} from "@/lib/data/repository";
import { recipeActionSchema } from "@/lib/validators";

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json(await publicSnapshot());
}

export async function POST(request: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const parsed = recipeActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid recipe action." }, { status: 400 });
  }

  try {
    const input = parsed.data;
    if (input.action === "create") return NextResponse.json({ recipe: await createRecipe(input) });
    if (input.action === "update") return NextResponse.json({ recipe: await updateRecipe(input) });
    if (input.action === "clone") return NextResponse.json({ recipe: await cloneRecipe(input.recipeId) });
    if (input.action === "activate") return NextResponse.json({ recipe: await activateRecipe(input.recipeId) });
    if (input.action === "archive") return NextResponse.json({ recipe: await archiveRecipe(input.recipeId) });
    if (input.action === "updatePrompt") return NextResponse.json({ prompt: await updatePrompt(input) });
    return NextResponse.json({ prompt: await addPromptToRecipe(input) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Recipe action failed." }, { status: 400 });
  }
}

const envelopeVersion = "commandloop-recipe-objective-v1";

export function packRecipeObjective(internalObjective: string, followUpNotes?: string) {
  if (!followUpNotes?.trim()) return internalObjective;
  return JSON.stringify({
    version: envelopeVersion,
    internalObjective,
    followUpNotes: followUpNotes.trim(),
  });
}

export function unpackRecipeObjective(value: string): { internalObjective: string; followUpNotes?: string } {
  try {
    const parsed = JSON.parse(value) as { version?: string; internalObjective?: string; followUpNotes?: string };
    if (parsed.version !== envelopeVersion || !parsed.internalObjective) return { internalObjective: value };
    return {
      internalObjective: parsed.internalObjective,
      followUpNotes: parsed.followUpNotes || undefined,
    };
  } catch {
    return { internalObjective: value };
  }
}

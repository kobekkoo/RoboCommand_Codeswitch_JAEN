import type { CommandSemanticAnnotation } from "@/lib/domain";

type PackedReviewNotes = {
  reviewerNotes?: string;
  semanticAnnotation?: CommandSemanticAnnotation;
};

const envelopeVersion = "commandloop-review-notes-v1";

export function packReviewNotes(reviewerNotes?: string, semanticAnnotation?: CommandSemanticAnnotation) {
  const trimmedNotes = reviewerNotes?.trim();
  if (!semanticAnnotation) return trimmedNotes || undefined;
  return JSON.stringify({
    version: envelopeVersion,
    reviewerNotes: trimmedNotes || "",
    semanticAnnotation,
  });
}

export function unpackReviewNotes(value?: string | null): PackedReviewNotes {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as Partial<PackedReviewNotes> & { version?: string };
    if (parsed.version !== envelopeVersion) return { reviewerNotes: value };
    return {
      reviewerNotes: parsed.reviewerNotes || undefined,
      semanticAnnotation: parsed.semanticAnnotation,
    };
  } catch {
    return { reviewerNotes: value };
  }
}

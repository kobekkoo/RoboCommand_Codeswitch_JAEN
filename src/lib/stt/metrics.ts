import { type NormalizationProfile } from "@/lib/domain";

const punctuationMap: Record<string, string> = {
  "“": '"',
  "”": '"',
  "‘": "'",
  "’": "'",
  "—": "-",
  "–": "-",
  "、": ",",
  "。": ".",
  "！": "!",
  "？": "?",
};

const nonSemanticPunctuationPattern = /[.,!?;:、。！？，．｡､]+/gu;
const cjkCharacterPattern = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u30FC]/u;
const latinWordCharacterPattern = /[\p{L}\p{N}'-]/u;

const japaneseOrthographicEquivalents: Array<[RegExp, string]> = [
  [/きれい/g, "綺麗"],
  [/奇麗/g, "綺麗"],
  [/あおい/g, "青い"],
  [/あかい/g, "赤い"],
  [/しろい/g, "白い"],
  [/くろい/g, "黒い"],
  [/きいろい/g, "黄色い"],
  [/みどり/g, "緑"],
  [/ひだり/g, "左"],
  [/みぎ/g, "右"],
  [/うえ/g, "上"],
  [/した/g, "下"],
  [/まえ/g, "前"],
  [/うしろ/g, "後ろ"],
  [/持って来て/g, "持ってきて"],
  [/もってきて/g, "持ってきて"],
  [/持つてきて/g, "持ってきて"],
  [/おいて/g, "置いて"],
  [/あけて/g, "開けて"],
  [/しめて/g, "閉めて"],
  [/とまって/g, "止まって"],
  [/さがして/g, "探して"],
];

export function normalizeTranscript(input: string, profile: NormalizationProfile) {
  let output = input;
  if (profile.nfkc) output = output.normalize("NFKC");
  if (profile.normalizePunctuation) {
    output = [...output].map((char) => punctuationMap[char] ?? char).join("");
  }
  if (profile.lowercaseLatin) output = output.toLocaleLowerCase("en-US");
  if (profile.collapseWhitespace) output = output.replace(/\s+/g, " ");
  return output.trim();
}

export function normalizeTranscriptForComparison(input: string, profile: NormalizationProfile) {
  let output = normalizeTranscript(input, profile);
  for (const [pattern, replacement] of japaneseOrthographicEquivalents) {
    output = output.replace(pattern, replacement);
  }
  if (profile.normalizePunctuation) output = output.replace(nonSemanticPunctuationPattern, " ");
  if (profile.collapseWhitespace) output = output.replace(/\s+/g, " ");
  return output.trim();
}

export type EditCounts = {
  insertions: number;
  deletions: number;
  substitutions: number;
};

export function editDistanceWithCounts(reference: string[], hypothesis: string[]): EditCounts {
  const rows = reference.length + 1;
  const cols = hypothesis.length + 1;
  const dp = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));

  for (let i = 0; i < rows; i += 1) dp[i]![0] = i;
  for (let j = 0; j < cols; j += 1) dp[0]![j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      if (reference[i - 1] === hypothesis[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]!;
      } else {
        dp[i]![j] = Math.min(
          dp[i - 1]![j]! + 1,
          dp[i]![j - 1]! + 1,
          dp[i - 1]![j - 1]! + 1,
        );
      }
    }
  }

  let i = reference.length;
  let j = hypothesis.length;
  const counts: EditCounts = { insertions: 0, deletions: 0, substitutions: 0 };

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && reference[i - 1] === hypothesis[j - 1]) {
      i -= 1;
      j -= 1;
    } else if (i > 0 && j > 0 && dp[i]![j] === dp[i - 1]![j - 1]! + 1) {
      counts.substitutions += 1;
      i -= 1;
      j -= 1;
    } else if (j > 0 && dp[i]![j] === dp[i]![j - 1]! + 1) {
      counts.insertions += 1;
      j -= 1;
    } else {
      counts.deletions += 1;
      i -= 1;
    }
  }

  return counts;
}

function rate(counts: EditCounts, denominator: number) {
  const edits = counts.insertions + counts.deletions + counts.substitutions;
  if (denominator === 0) return edits === 0 ? 0 : 1;
  return edits / denominator;
}

export function mixedTokensForMer(value: string) {
  const tokens: string[] = [];
  let latinBuffer = "";
  const flushLatin = () => {
    if (!latinBuffer) return;
    tokens.push(latinBuffer);
    latinBuffer = "";
  };

  for (const char of value) {
    if (/\s/u.test(char)) {
      flushLatin();
    } else if (cjkCharacterPattern.test(char)) {
      flushLatin();
      tokens.push(char);
    } else if (latinWordCharacterPattern.test(char)) {
      latinBuffer += char;
    } else {
      flushLatin();
    }
  }
  flushLatin();
  return tokens;
}

const semanticRiskLexicons: Record<string, RegExp[]> = {
  action: [
    /\b(pick|grab|bring|place|put|clean|wipe|open|close|move|stop|pause|search|find)\b/u,
    /持ってきて|置いて|綺麗|掃除|拭いて|開けて|閉めて|動か|止ま|探して/u,
  ],
  object: [/\b(cup|mug|bottle|table|door|box|bag|tray|medicine|medication|bed|chair)\b/u, /カップ|ボトル|テーブル|ドア|箱|薬|ベッド|椅子/u],
  color: [/\b(red|blue|white|black|yellow|green)\b/u, /赤い|青い|白い|黒い|黄色い|緑/u],
  direction: [/\b(left|right|up|down|front|back|forward|backward|top|bottom)\b/u, /左|右|上|下|前|後ろ/u],
  negation: [/\b(no|not|don't|do not|never|without|stop)\b/u, /ない|しない|やめて|禁止/u],
  safety: [/\b(stop|pause|danger|dangerous|emergency|help|fall|fallen|patient|nurse)\b/u, /止ま|危険|緊急|助け|転倒|患者|看護/u],
};

function matchedRiskTerms(text: string, patterns: RegExp[]) {
  return patterns.flatMap((pattern) => text.match(pattern)?.[0] ?? []);
}

function semanticRiskFlags(reference: string, hypothesis: string, options?: { safetySensitive?: boolean }) {
  const flags = new Set<string>();
  for (const [category, patterns] of Object.entries(semanticRiskLexicons)) {
    const referenceMatches = matchedRiskTerms(reference, patterns);
    const hypothesisMatches = matchedRiskTerms(hypothesis, patterns);
    const referenceKey = referenceMatches.sort().join("|");
    const hypothesisKey = hypothesisMatches.sort().join("|");
    if (referenceKey !== hypothesisKey) flags.add(category);
  }
  if (options?.safetySensitive && reference !== hypothesis) flags.add("safety_sensitive");
  return [...flags];
}

export function calculateTranscriptMetrics(
  reference: string,
  hypothesis: string,
  profile: NormalizationProfile,
  options?: { safetySensitive?: boolean },
) {
  const referenceNormalized = normalizeTranscriptForComparison(reference, profile);
  const hypothesisNormalized = normalizeTranscriptForComparison(hypothesis, profile);
  const referenceWords = referenceNormalized ? referenceNormalized.split(/\s+/) : [];
  const hypothesisWords = hypothesisNormalized ? hypothesisNormalized.split(/\s+/) : [];
  const referenceMixedTokens = mixedTokensForMer(referenceNormalized);
  const hypothesisMixedTokens = mixedTokensForMer(hypothesisNormalized);
  const referenceForCer = profile.ignoreSpacesForCer
    ? referenceNormalized.replace(/\s+/g, "")
    : referenceNormalized;
  const hypothesisForCer = profile.ignoreSpacesForCer
    ? hypothesisNormalized.replace(/\s+/g, "")
    : hypothesisNormalized;
  const wordCounts = editDistanceWithCounts(referenceWords, hypothesisWords);
  const characterCounts = editDistanceWithCounts([...referenceForCer], [...hypothesisForCer]);
  const mixedCounts = editDistanceWithCounts(referenceMixedTokens, hypothesisMixedTokens);

  return {
    referenceNormalized,
    hypothesisNormalized,
    wordErrorRate: rate(wordCounts, referenceWords.length),
    characterErrorRate: rate(characterCounts, [...referenceForCer].length),
    mixedErrorRate: rate(mixedCounts, referenceMixedTokens.length),
    overgenerationRate: referenceMixedTokens.length
      ? mixedCounts.insertions / referenceMixedTokens.length
      : hypothesisMixedTokens.length
        ? 1
        : 0,
    exactMatch: referenceNormalized === hypothesisNormalized,
    insertions: wordCounts.insertions,
    deletions: wordCounts.deletions,
    substitutions: wordCounts.substitutions,
    referenceWordCount: referenceWords.length,
    referenceCharacterCount: [...referenceForCer].length,
    semanticRiskFlags: semanticRiskFlags(referenceNormalized, hypothesisNormalized, options),
    characterInsertions: characterCounts.insertions,
    characterDeletions: characterCounts.deletions,
    characterSubstitutions: characterCounts.substitutions,
    mixedInsertions: mixedCounts.insertions,
    mixedDeletions: mixedCounts.deletions,
    mixedSubstitutions: mixedCounts.substitutions,
    referenceMixedTokenCount: referenceMixedTokens.length,
  };
}

import { allCountriesSorted, countryByIso3 } from "@/lib/countries";
import { CountryMetrics, LayerMode, RiskBand } from "@/lib/types";

export const riskClassByBand: Record<RiskBand, string> = {
  critical: "chip-critical",
  high: "chip-high",
  moderate: "chip-moderate",
  low: "chip-low"
};

export function getRiskClass(riskBand?: RiskBand): string {
  if (!riskBand) return riskClassByBand.low;
  return riskClassByBand[riskBand] ?? riskClassByBand.low;
}

export function getOutlierLabel(flag: "low" | "high" | "none"): string {
  if (flag === "high") return "High BBR outlier";
  if (flag === "low") return "Low BBR outlier";
  return "Within range";
}

export function getCountrySuggestions(): string[] {
  return allCountriesSorted.map((row) => row.name);
}

export function resolveJumpToCountryIso3(rawQuery: string): string | null {
  const raw = rawQuery.trim();
  const isoFromLabel = raw.match(/\(([A-Za-z]{3})\)$/)?.[1]?.toUpperCase();
  if (isoFromLabel && countryByIso3.has(isoFromLabel)) {
    return isoFromLabel;
  }

  const needle = raw.toLowerCase();
  if (!needle) return null;

  const exactIso = allCountriesSorted.find((item) => item.iso3.toLowerCase() === needle);
  if (exactIso) {
    return exactIso.iso3;
  }

  const exactName = allCountriesSorted.find((item) => item.name.toLowerCase() === needle);
  if (exactName) {
    return exactName.iso3;
  }

  const nameMatch = allCountriesSorted.find((item) => item.name.toLowerCase().includes(needle));
  if (nameMatch) {
    return nameMatch.iso3;
  }

  return null;
}

const voiceCountryPrefixes = [
  /^crisis\s*lens[:,\s-]*/i,
  /^(?:go|move|jump|zoom|fly|navigate)\s+to\s+/i,
  /^(?:take\s+me\s+to|focus\s+on|set\s+country\s+to|country)\s+/i,
  /^(?:select|open|show)\s+/i
];

function cleanVoiceCandidate(value: string): string {
  return value
    .replace(/^[\s"'`]+|[\s"'`]+$/g, "")
    .replace(/[!?.,;:]+/g, " ")
    .replace(/\b(?:please|now|thanks|thank you)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveVoiceCommandToCountryIso3(rawTranscript: string): string | null {
  const base = cleanVoiceCandidate(rawTranscript);
  if (!base) return null;

  const candidates = new Set<string>([base]);
  let stripped = base;

  // Allow chained command prefixes such as "CrisisLens, go to Canada".
  for (let i = 0; i < 3; i += 1) {
    const before = stripped;
    for (const prefix of voiceCountryPrefixes) {
      stripped = stripped.replace(prefix, "").trim();
    }
    if (stripped && stripped !== before) {
      candidates.add(stripped);
      continue;
    }
    break;
  }

  for (const candidate of candidates) {
    const iso3 = resolveJumpToCountryIso3(candidate);
    if (iso3) return iso3;
  }

  return null;
}

function formatUsdCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(Math.max(0, value));
}

function toMetricLabel(mode: LayerMode): string {
  if (mode === "severity") return "severity score";
  if (mode === "inNeedRate") return "in-need rate";
  if (mode === "fundingGap") return "funding gap";
  if (mode === "coverage") return "funding coverage";
  return "overlooked index";
}

export function buildMlGenieQueryTemplates(args: {
  metrics: CountryMetrics[];
  layerMode: LayerMode;
  selectedIso3: string | null;
}): string[] {
  const topByOci = [...args.metrics]
    .sort((a, b) => (b.overlookedScore ?? 0) - (a.overlookedScore ?? 0))
    .slice(0, 3);
  const topByFundingGap = [...args.metrics]
    .sort((a, b) => {
      const bValue = Math.max(0, b.fundingRequired - b.fundingReceived);
      const aValue = Math.max(0, a.fundingRequired - a.fundingReceived);
      return bValue - aValue;
    })
    .slice(0, 3);

  const selected = args.selectedIso3
    ? args.metrics.find((row) => row.iso3 === args.selectedIso3) ?? null
    : null;
  const selectedLabel = selected ? `${selected.country} (${selected.iso3})` : null;
  const selectedGap = selected ? Math.max(0, selected.fundingRequired - selected.fundingReceived) : 0;

  const templates = [
    topByOci.length
      ? `Re-rank the top overlooked crises and compare ${topByOci.map((row) => `${row.country} (${row.iso3})`).join(", ")} using latest OCI, coverage, and total funding gap values.`
      : "Rank the top overlooked crises by OCI with coverage and total funding gap.",
    topByFundingGap.length
      ? `For ${topByFundingGap.map((row) => `${row.country} (${row.iso3})`).join(", ")}, explain where incremental funding has the highest projected impact and quantify trade-offs.`
      : "Show where incremental funding has the highest projected impact and quantify trade-offs.",
    selectedLabel
      ? `For ${selectedLabel}, simulate how an extra ${formatUsdCompact(Math.max(5_000_000, selectedGap * 0.1))} changes rank, projected neglect, and priority versus peer countries.`
      : "Pick one high-priority country and simulate how extra funding changes rank and projected neglect.",
    `Show top 10 countries by ${toMetricLabel(args.layerMode)} and include people in need, funding gap USD, and coverage percent in one table.`
  ];

  return templates;
}

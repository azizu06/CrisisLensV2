import { NextRequest, NextResponse } from "next/server";
import { checkDatabricksReadRateLimit } from "@/lib/api/rate-limit";
import { fetchLatestCountryRows } from "@/lib/databricks/latest-country";
import { loadCountryMetrics } from "@/lib/loadMetrics";

type VisualRow = {
  iso3: string;
  country: string;
  year: number;
  funding_coverage_ratio: number;
  coverage_pct: number;
  funding_gap_usd: number;
  funding_gap_per_person: number;
  people_in_need: number;
  oci_score?: number;
  severity_score?: number;
};

export async function GET(request: NextRequest) {
  const rateLimited = checkDatabricksReadRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const latest = await fetchLatestCountryRows();
    const rows: VisualRow[] = latest.map((row) => ({
      iso3: row.iso3,
      country: row.country,
      year: row.year,
      funding_coverage_ratio: Math.max(0, Math.min(1, row.funding_coverage_pct / 100)),
      coverage_pct: row.funding_coverage_pct,
      funding_gap_usd: row.funding_gap_usd,
      funding_gap_per_person: row.funding_gap_per_person_usd,
      people_in_need: row.people_in_need,
      oci_score: row.overlooked_crisis_index,
      severity_score: row.severity_score
    }));
    return NextResponse.json(rows);
  } catch {
    const fallback = await loadCountryMetrics();
    const rows: VisualRow[] = fallback.map((row) => {
      const fundingGapUsd = Math.max((row.fundingRequired || 0) - (row.fundingReceived || 0), 0);
      const peopleInNeed = Math.max(0, row.inNeed || 0);
      const coveragePct = Math.max(0, Math.min(100, row.percentFunded || 0));
      return {
        iso3: row.iso3,
        country: row.country,
        year: row.latestFundingYear || row.latestYear || new Date().getFullYear(),
        funding_coverage_ratio: coveragePct / 100,
        coverage_pct: coveragePct,
        funding_gap_usd: fundingGapUsd,
        funding_gap_per_person: peopleInNeed > 0 ? fundingGapUsd / peopleInNeed : 0,
        people_in_need: peopleInNeed,
        oci_score: row.overlookedScore,
        severity_score: row.severityScore
      };
    });
    return NextResponse.json(rows);
  }
}

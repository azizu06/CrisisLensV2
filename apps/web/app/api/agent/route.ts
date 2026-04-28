import { NextRequest, NextResponse } from "next/server";
import { checkDatabricksReadRateLimit } from "@/lib/api/rate-limit";
import { getDatabricksProvider } from "@/lib/databricks/client";
import { loadCountryMetrics } from "@/lib/loadMetrics";
import { getLayerValue, riskBandFromScore } from "@/lib/metrics";

export async function GET(request: NextRequest) {
  const iso3 = request.nextUrl.searchParams.get("iso3")?.trim().toUpperCase() ?? "";
  if (!iso3 || iso3.length !== 3) {
    return NextResponse.json({ error: "Invalid ISO3 code." }, { status: 400 });
  }

  const rateLimited = checkDatabricksReadRateLimit(request);
  if (rateLimited) return rateLimited;

  const provider = getDatabricksProvider();
  const state = await provider.fetchCountryState(iso3);

  if (state) {
    return NextResponse.json(state);
  }

  const fallbackMetrics = await loadCountryMetrics();
  const row = fallbackMetrics.find((item) => item.iso3 === iso3);
  if (!row) {
    return NextResponse.json(
      {
        error: "Agent state unavailable. Configure Databricks SQL env vars and verify source table access."
      },
      { status: 503 }
    );
  }

  const overlooked = getLayerValue(row, "overlooked");
  const coverage = Math.max(0, Math.min(100, row.percentFunded || 0));
  const fundingGap = Math.max(0, (row.fundingRequired || 0) - (row.fundingReceived || 0));
  const stateFromMetrics = {
    iso3: row.iso3,
    narrative: `${row.country} snapshot indicates ${coverage.toFixed(1)}% coverage and ${new Intl.NumberFormat(
      "en-US",
      { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }
    ).format(fundingGap)} funding gap.`,
    riskBand: riskBandFromScore(overlooked),
    confidence: 0.55,
    agentTimestamp: new Date().toISOString(),
    riskDrivers: [
      `Overlooked index score ${overlooked.toFixed(1)}.`,
      `Coverage currently ${coverage.toFixed(1)}%.`,
      "Databricks live agent state was unavailable, using latest merged metrics."
    ],
    recommendedActions: [
      "Prioritize highest gap-per-person sectors first.",
      "Validate current targeting assumptions with country team.",
      "Refresh live Databricks agent signal when connection stabilizes."
    ]
  };

  return NextResponse.json(stateFromMetrics);
}

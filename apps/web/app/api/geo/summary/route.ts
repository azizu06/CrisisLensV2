import { NextResponse } from "next/server";
import { checkDatabricksExpensiveRateLimit } from "@/lib/api/rate-limit";
import { GeoMetrics, fetchGeoMetricsByIso3, generateGeoInsight, mapGeoError } from "@/lib/geo-insight";

type Payload = {
  metrics?: GeoMetrics;
  question?: string;
};

export async function POST(request: Request) {
  let payload: Payload;

  try {
    payload = (await request.json()) as Payload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  if (!payload.metrics || !payload.metrics.iso3 || !payload.metrics.country) {
    return NextResponse.json({ ok: false, error: "metrics with iso3/country are required." }, { status: 400 });
  }

  const rateLimited = checkDatabricksExpensiveRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    // Always re-read the latest Databricks row for numeric grounding.
    const groundedMetrics = await fetchGeoMetricsByIso3(payload.metrics.iso3);
    const result = await generateGeoInsight(groundedMetrics, payload.question);
    return NextResponse.json({
      ok: true,
      data: {
        ...result.insight,
        source: result.source,
        askedQuestion: payload.question?.trim() || null
      }
    });
  } catch (error) {
    const mapped = mapGeoError(error);
    return NextResponse.json({ ok: false, error: mapped.message }, { status: mapped.status });
  }
}

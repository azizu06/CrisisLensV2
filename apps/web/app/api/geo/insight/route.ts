import { NextRequest, NextResponse } from "next/server";
import { checkDatabricksExpensiveRateLimit } from "@/lib/api/rate-limit";
import { fetchGeoMetricsByIso3, generateGeoInsight, mapGeoError, resolveIso3 } from "@/lib/geo-insight";

export async function GET(request: NextRequest) {
  const iso3Param = request.nextUrl.searchParams.get("iso3");
  const countryParam = request.nextUrl.searchParams.get("country");

  if (!iso3Param && !countryParam) {
    return NextResponse.json(
      {
        ok: false,
        error: "Provide iso3 or country query parameter."
      },
      { status: 400 }
    );
  }

  const rateLimited = checkDatabricksExpensiveRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const iso3 = await resolveIso3({
      iso3: iso3Param,
      country: countryParam
    });

    const metrics = await fetchGeoMetricsByIso3(iso3);
    const result = await generateGeoInsight(metrics);

    return NextResponse.json({
      ok: true,
      data: {
        metrics,
        insight: {
          ...result.insight,
          source: result.source,
          askedQuestion: null
        }
      }
    });
  } catch (error) {
    const mapped = mapGeoError(error);
    return NextResponse.json({ ok: false, error: mapped.message }, { status: mapped.status });
  }
}

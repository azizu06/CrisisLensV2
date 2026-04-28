import { NextRequest, NextResponse } from "next/server";
import { checkDatabricksReadRateLimit } from "@/lib/api/rate-limit";
import { fetchGeoMetricsByIso3, mapGeoError } from "@/lib/geo-insight";

export async function GET(request: NextRequest) {
  const iso3 = request.nextUrl.searchParams.get("iso3")?.trim();

  if (!iso3) {
    return NextResponse.json({ ok: false, error: "iso3 is required." }, { status: 400 });
  }

  const rateLimited = checkDatabricksReadRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const metrics = await fetchGeoMetricsByIso3(iso3);
    return NextResponse.json({ ok: true, data: metrics });
  } catch (error) {
    const mapped = mapGeoError(error);
    return NextResponse.json({ ok: false, error: mapped.message }, { status: mapped.status });
  }
}

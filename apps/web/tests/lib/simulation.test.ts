import { describe, expect, it } from "vitest";
import { buildQuarterlySimulation } from "@/lib/simulation";
import { CountryMetrics } from "@/lib/types";

const baseRows: CountryMetrics[] = [
  {
    iso3: "AAA",
    country: "Aland",
    population: 1_000_000,
    inNeed: 420_000,
    targeted: 220_000,
    affected: 300_000,
    reached: 110_000,
    fundingRequired: 120_000_000,
    fundingReceived: 20_000_000,
    percentFunded: 16.7,
    revisedPlanRequirements: 120_000_000,
    latestFundingYear: 2026,
    severityScore: 88,
    overlookedScore: 78,
    ensembleScore: 82,
    futureProjections: [
      {
        step: "q2",
        monthsAhead: 6,
        horizonModel: "1yr",
        scores: { ensembleScore: 84 }
      },
      {
        step: "q4",
        monthsAhead: 12,
        horizonModel: "1yr",
        scores: { ensembleScore: 86 }
      },
      {
        step: "q8",
        monthsAhead: 24,
        horizonModel: "2yr",
        scores: { ensembleScore: 89 }
      }
    ]
  },
  {
    iso3: "BBB",
    country: "Borland",
    population: 900_000,
    inNeed: 190_000,
    targeted: 170_000,
    affected: 120_000,
    reached: 150_000,
    fundingRequired: 110_000_000,
    fundingReceived: 78_000_000,
    percentFunded: 70.9,
    revisedPlanRequirements: 110_000_000,
    latestFundingYear: 2026,
    severityScore: 62,
    overlookedScore: 52,
    ensembleScore: 57,
    futureProjections: []
  }
];

describe("quarterly simulation", () => {
  it("builds 8 quarterly steps and reduces selected-country OCI with allocation", () => {
    const simulation = buildQuarterlySimulation(baseRows, "AAA", 32_000_000);

    expect(simulation.quarters).toHaveLength(8);
    expect(simulation.quarters[0].months_ahead).toBe(3);
    expect(simulation.quarters[7].months_ahead).toBe(24);

    expect(simulation.quarters[0].selected_country.funding_received).toBeGreaterThan(baseRows[0].fundingReceived);
    expect(simulation.quarters[7].selected_country.funding_received).toBe(
      baseRows[0].fundingReceived + 32_000_000
    );

    expect(simulation.base.oci).toBeGreaterThan(simulation.scenario.oci);
    expect(simulation.overall_score_delta).toBeLessThan(0);

    expect(simulation.quarters[0].selected_country.overall_score_delta).toBeLessThan(0);
    expect(simulation.quarters[7].selected_country.overall_score_delta).toBeLessThan(0);

    expect(simulation.country_impacts.length).toBeGreaterThan(0);
    expect(simulation.country_impacts[0]?.rank_before).toBeGreaterThanOrEqual(1);
    expect(typeof simulation.country_impacts[0]?.projected_neglect_delta).toBe("number");

    expect(simulation.impact_arrows.length).toBeGreaterThan(0);
    expect(simulation.impact_arrows[0]?.from_iso3).toBe("AAA");
    expect(simulation.impact_arrows[0]?.to_iso3).toBe("BBB");
    expect(typeof simulation.impact_arrows[0]?.projected_neglect_delta).toBe("number");
  });

  it("applies EDA dataset adjustment signals (donor diversity, internal, cluster gap)", () => {
    const rows: CountryMetrics[] = [
      {
        ...baseRows[0],
        iso3: "LOW",
        country: "Low Diversity",
        donorDiversityScore: 18,
        internalFundingUsd: 20_000_000,
        globalClusterGapPct: 80
      },
      {
        ...baseRows[0],
        iso3: "HIGH",
        country: "High Diversity",
        donorDiversityScore: 90,
        internalFundingUsd: 500_000,
        globalClusterGapPct: 12
      }
    ];

    const simulation = buildQuarterlySimulation(rows, "LOW", 0);
    const q1 = simulation.quarters[0];
    const low = q1.metrics_overrides.find((row) => row.iso3 === "LOW");
    const high = q1.metrics_overrides.find((row) => row.iso3 === "HIGH");

    expect(low).toBeDefined();
    expect(high).toBeDefined();
    expect(low!.overlooked_score).toBeGreaterThan(high!.overlooked_score);
  });

  it("reduces projected neglect when funding allocation increases", () => {
    const baseline = buildQuarterlySimulation(baseRows, "AAA", 0);
    const funded = buildQuarterlySimulation(baseRows, "AAA", 32_000_000);

    expect(funded.scenario.projected_neglect).toBeLessThan(baseline.scenario.projected_neglect);
    expect(funded.quarters[7].selected_country.projected_neglect).toBeLessThan(
      baseline.quarters[7].selected_country.projected_neglect
    );
  });

  it("projects score drift even when no event projections are available", () => {
    const rows: CountryMetrics[] = [
      {
        iso3: "NOE",
        country: "No Events",
        population: 2_000_000,
        inNeed: 900_000,
        targeted: 500_000,
        affected: 650_000,
        reached: 260_000,
        fundingRequired: 100_000_000,
        fundingReceived: 50_000_000,
        percentFunded: 50,
        revisedPlanRequirements: 100_000_000,
        latestFundingYear: 2026,
        severityScore: 80,
        overlookedScore: 68,
        ensembleScore: 68,
        futureProjections: []
      },
      {
        ...baseRows[1],
        iso3: "CMP",
        country: "Comparator"
      }
    ];

    const simulation = buildQuarterlySimulation(rows, "NOE", 0);
    const q1 = simulation.quarters[0].selected_country.projected_neglect;
    const q8 = simulation.quarters[7].selected_country.projected_neglect;

    expect(q1).not.toBe(68);
    expect(q8).toBeGreaterThan(q1);
  });

  it("returns leaderboard rank shifts for the global OCI board", () => {
    const simulation = buildQuarterlySimulation(baseRows, "AAA", 32_000_000);

    expect(simulation.leaderboard_changes.length).toBeGreaterThan(0);
    const selected = simulation.leaderboard_changes.find((row) => row.iso3 === "AAA");

    expect(selected).toBeDefined();
    expect(selected?.rank_before).toBe(simulation.base.rank);
    expect(selected?.rank_after).toBe(simulation.scenario.rank);
  });

  it("marks arrows as pressure when a peer stays ahead while the selected country gains funding", () => {
    const rows: CountryMetrics[] = [
      {
        iso3: "AAA",
        country: "Aland",
        population: 1_200_000,
        inNeed: 480_000,
        targeted: 260_000,
        affected: 340_000,
        reached: 130_000,
        fundingRequired: 120_000_000,
        fundingReceived: 26_000_000,
        percentFunded: 21.7,
        revisedPlanRequirements: 120_000_000,
        latestFundingYear: 2026,
        severityScore: 84,
        overlookedScore: 70,
        ensembleScore: 70,
        futureProjections: [
          {
            step: "q8",
            monthsAhead: 24,
            horizonModel: "2yr",
            neglectFlagPred: true,
            scores: { ensembleScore: 70 }
          }
        ]
      },
      {
        iso3: "BBB",
        country: "Borland",
        population: 950_000,
        inNeed: 330_000,
        targeted: 200_000,
        affected: 220_000,
        reached: 125_000,
        fundingRequired: 105_000_000,
        fundingReceived: 40_000_000,
        percentFunded: 38.1,
        revisedPlanRequirements: 105_000_000,
        latestFundingYear: 2026,
        severityScore: 86,
        overlookedScore: 85,
        ensembleScore: 85,
        futureProjections: [
          {
            step: "q8",
            monthsAhead: 24,
            horizonModel: "2yr",
            scores: { ensembleScore: 70 }
          }
        ]
      }
    ];

    const simulation = buildQuarterlySimulation(rows, "AAA", 18_000_000);
    const bbbArrow = simulation.impact_arrows.find((arrow) => arrow.to_iso3 === "BBB");

    expect(bbbArrow).toBeDefined();
    // Peer countries receive no funding allocation, so their OCI score is identical between
    // the no-funding and with-funding scenarios at the same Q+8 horizon. Direction is
    // determined by relative rank movement (BBB overtakes / stays ahead of the now-better-
    // funded selected country), not by the peer's own score change.
    expect(bbbArrow?.overall_score_delta).toBe(0);
    expect(bbbArrow?.direction).toBe("pressure");
    expect(typeof bbbArrow?.projected_neglect_delta).toBe("number");
  });
});

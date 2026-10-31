import { describe, expect, it } from "vitest";
import {
  getCountrySuggestions,
  getOutlierLabel,
  getRiskClass,
  riskClassByBand,
  resolveJumpToCountryIso3,
  resolveVoiceCommandToCountryIso3
} from "@/components/dashboard/dashboard-utils";

describe("dashboard utils", () => {
  it("maps risk band to css class", () => {
    expect(getRiskClass("critical")).toBe(riskClassByBand.critical);
    expect(getRiskClass("high")).toBe(riskClassByBand.high);
    expect(getRiskClass("moderate")).toBe(riskClassByBand.moderate);
    expect(getRiskClass("low")).toBe(riskClassByBand.low);
  });

  it("maps outlier flag to user label", () => {
    expect(getOutlierLabel("high")).toBe("High BBR outlier");
    expect(getOutlierLabel("low")).toBe("Low BBR outlier");
    expect(getOutlierLabel("none")).toBe("Within range");
  });

  it("resolves jump-to-country iso3 from label, iso code, and partial country name", () => {
    expect(resolveJumpToCountryIso3("Germany (DEU)")).toBe("DEU");
    expect(resolveJumpToCountryIso3("deu")).toBe("DEU");
    expect(resolveJumpToCountryIso3("ethiop")).toBe("ETH");
  });

  it("returns null when query is empty or unmatched", () => {
    expect(resolveJumpToCountryIso3("   ")).toBeNull();
    expect(resolveJumpToCountryIso3("NOT-A-REAL-COUNTRY")).toBeNull();
  });

  it("resolves voice command country selections", () => {
    expect(resolveVoiceCommandToCountryIso3("go to canada")).toBe("CAN");
    expect(resolveVoiceCommandToCountryIso3("select Ethiopia please")).toBe("ETH");
    expect(resolveVoiceCommandToCountryIso3("CrisisLens, jump to Germany now")).toBe("DEU");
  });

  it("returns null for unmatched voice commands", () => {
    expect(resolveVoiceCommandToCountryIso3("increase the globe size")).toBeNull();
    expect(resolveVoiceCommandToCountryIso3("   ")).toBeNull();
  });

  it("exposes country suggestions in name-only format", () => {
    const suggestions = getCountrySuggestions();
    expect(suggestions.length).toBeGreaterThan(100);
    expect(suggestions.includes("Germany")).toBe(true);
    expect(suggestions.some((item) => /\([A-Z]{3}\)$/.test(item))).toBe(false);
  });

  it("resolves a name-only suggestion to that exact country, not a longer name containing it", () => {
    expect(resolveJumpToCountryIso3("Sudan")).toBe("SDN");
    expect(resolveJumpToCountryIso3("Guinea")).toBe("GIN");
    expect(resolveJumpToCountryIso3("India")).toBe("IND");
  });
});

import { describe, it, expect } from "vitest";
import { getPartsAvailability } from "../src/lib/gvo/parts-availability";

describe("getPartsAvailability", () => {
  it("treats makes case-insensitively", () => {
    expect(getPartsAvailability("Toyota").score).toBe("high");
    expect(getPartsAvailability("toyota").score).toBe("high");
    expect(getPartsAvailability("BMW").score).toBe("high");
  });

  it("scores high-volume imports as high", () => {
    expect(getPartsAvailability("toyota").score).toBe("high");
    expect(getPartsAvailability("honda").score).toBe("high");
    expect(getPartsAvailability("bajaj").score).toBe("high");
  });

  it("scores medium-volume imports as medium", () => {
    expect(getPartsAvailability("mazda").score).toBe("medium");
    expect(getPartsAvailability("ford").score).toBe("medium");
    expect(getPartsAvailability("volkswagen").score).toBe("medium");
  });

  it("scores low-volume imports as low", () => {
    expect(getPartsAvailability("yutong").score).toBe("low");
    expect(getPartsAvailability("zhongtong").score).toBe("low");
  });

  it("unknown makes default to low availability", () => {
    const result = getPartsAvailability("SomeObscureMarque");
    expect(result.score).toBe("low");
    expect(result.label).toBe("Low");
  });

  it("returns labels and descriptions that encourage local verification", () => {
    for (const make of ["toyota", "mazda", "yutong"]) {
      const result = getPartsAvailability(make);
      expect(result.label).toBeDefined();
      expect(result.description).toContain("Verify availability locally");
    }
  });

  it("high/medium/low labels match their scores", () => {
    for (const make of ["toyota", "mazda", "yutong"]) {
      const result = getPartsAvailability(make);
      const expected = { high: "High", medium: "Medium", low: "Low" }[result.score];
      expect(result.label).toBe(expected);
    }
  });
});

import {
  buildVehicleQuery,
  buildPartQuery,
  buildHeroQuery,
  buildConditionQuery,
} from "@/lib/images/queries";

describe("buildVehicleQuery", () => {
  it("primary includes year+make+model+trim+bodyType", () => {
    const result = buildVehicleQuery({
      make: "Toyota",
      model: "Camry",
      trim: "XLE",
      year: 2022,
      bodyType: "sedan",
    });
    expect(result.query).toBe("2022 Toyota Camry XLE sedan");
  });

  it("fallback1 removes trim, keeps year+make+model+bodyType", () => {
    const result = buildVehicleQuery({
      make: "Toyota",
      model: "Camry",
      trim: "XLE",
      year: 2022,
      bodyType: "sedan",
    });
    expect(result.fallback[0].query).toBe("2022 Toyota Camry sedan");
  });

  it("fallback2 removes trim AND bodyType, keeps year+make+model", () => {
    const result = buildVehicleQuery({
      make: "Toyota",
      model: "Camry",
      trim: "XLE",
      year: 2022,
      bodyType: "sedan",
    });
    expect(result.fallback[1].query).toBe("2022 Toyota Camry");
  });

  it("fallback3 is just make+bodyType", () => {
    const result = buildVehicleQuery({
      make: "Toyota",
      model: "Camry",
      trim: "XLE",
      year: 2022,
      bodyType: "sedan",
    });
    expect(result.fallback[2].query).toBe("Toyota sedan");
  });

  it("all 4 fallbacks are distinct", () => {
    const result = buildVehicleQuery({
      make: "Toyota",
      model: "Camry",
      trim: "XLE",
      year: 2022,
      bodyType: "sedan",
    });
    const queries = [result.query, ...result.fallback.map((f) => f.query)];
    const unique = new Set(queries);
    expect(unique.size).toBe(4);
  });

  it("no trim: fallbacks still produce distinct queries", () => {
    const result = buildVehicleQuery({
      make: "Toyota",
      model: "Camry",
      year: 2022,
      bodyType: "sedan",
    });
    const fallbackQueries = result.fallback.map((f) => f.query);
    const unique = new Set(fallbackQueries);
    expect(unique.size).toBe(3);
  });
});

describe("buildPartQuery", () => {
  const params = { make: "Toyota", model: "Camry", year: 2022 };

  it("exterior returns YEAR MAKE MODEL (no part term)", () => {
    expect(buildPartQuery({ ...params, part: "exterior" })).toBe(
      "2022 Toyota Camry",
    );
  });

  it("interior returns YEAR MAKE MODEL interior", () => {
    expect(buildPartQuery({ ...params, part: "interior" })).toBe(
      "2022 Toyota Camry interior",
    );
  });

  it("engine returns YEAR MAKE MODEL engine bay", () => {
    expect(buildPartQuery({ ...params, part: "engine" })).toBe(
      "2022 Toyota Camry engine bay",
    );
  });

  it("all 10 part types produce distinct queries", () => {
    const parts = [
      "exterior",
      "interior",
      "engine",
      "dashboard",
      "wheels",
      "rear",
      "front",
      "side",
      "trunk",
      "seats",
    ] as const;

    const queries = parts.map((part) => buildPartQuery({ ...params, part }));
    const unique = new Set(queries);
    expect(unique.size).toBe(10);
  });
});

describe("buildHeroQuery", () => {
  it("returns YEAR MAKE MODEL car", () => {
    expect(
      buildHeroQuery({ make: "Toyota", model: "Camry", year: 2022 }),
    ).toBe("2022 Toyota Camry car");
  });
});

describe("buildConditionQuery", () => {
  it("returns MAKE MODEL vehicle SEVERITY ISSUE close up", () => {
    expect(
      buildConditionQuery({
        make: "Toyota",
        model: "Camry",
        issue: "dent",
        severity: "moderate",
      }),
    ).toBe("Toyota Camry vehicle moderate dent close up");
  });
});

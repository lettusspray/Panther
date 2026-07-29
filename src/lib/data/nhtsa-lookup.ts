const NHTSA_BASE = "https://vpic.nhtsa.dot.gov/api";

function normaliseNhtsaName(upper: string): string {
  return upper
    .toLowerCase()
    .split(/[\s-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
    .replace(/Gmc\b/, "GMC")
    .replace(/Bmw\b/, "BMW")
    .replace(/Mv Agusta\b/, "MV Agusta");
}

interface NhtsaMakeResult {
  MakeId: number;
  MakeName: string;
  VehicleTypeId: number;
  VehicleTypeName: string;
}

interface NhtsaModelResult {
  Make_ID: number;
  Make_Name: string;
  Model_ID: number;
  Model_Name: string;
}

export interface NhtsaLookupResult {
  makeId: number;
  makeName: string;
  modelId: number;
  modelName: string;
}

async function fetchNhtsaModels(makeId: number): Promise<NhtsaModelResult[]> {
  const url = `${NHTSA_BASE}/vehicles/GetModelsForMakeId/${makeId}?format=json`;
  const res = await fetch(url);
  const data = await res.json() as { Results: NhtsaModelResult[] };
  return data?.Results ?? [];
}

export async function searchNhtsaMakes(query: string): Promise<NhtsaLookupResult[]> {
  const q = query.toLowerCase();
  const results: NhtsaLookupResult[] = [];

  for (const vt of ["car", "motorcycle", "truck", "bus"]) {
    const url = `${NHTSA_BASE}/vehicles/GetMakesForVehicleType/${vt}?format=json`;
    try {
      const res = await fetch(url);
      const data = await res.json() as { Results: NhtsaMakeResult[] };
      if (!data?.Results) continue;
      for (const make of data.Results) {
        if (make.MakeName.toLowerCase().includes(q)) {
          const normalised = normaliseNhtsaName(make.MakeName);
          const models = await fetchNhtsaModels(make.MakeId);
          for (const model of models) {
            results.push({
              makeId: make.MakeId,
              makeName: normalised,
              modelId: model.Model_ID,
              modelName: model.Model_Name,
            });
          }
        }
      }
    } catch {
      continue;
    }
  }

  return results;
}

export async function searchNhtsaMakeModel(
  makeQuery: string,
  modelQuery: string,
): Promise<NhtsaLookupResult | null> {
  const q = makeQuery.toLowerCase();
  const mq = modelQuery.toLowerCase();

  for (const vt of ["car", "motorcycle", "truck", "bus"]) {
    const url = `${NHTSA_BASE}/vehicles/GetMakesForVehicleType/${vt}?format=json`;
    try {
      const res = await fetch(url);
      const data = await res.json() as { Results: NhtsaMakeResult[] };
      if (!data?.Results) continue;

      for (const make of data.Results) {
        if (make.MakeName.toLowerCase() !== q) continue;

        const models = await fetchNhtsaModels(make.MakeId);
        for (const model of models) {
          const cleanModel = model.Model_Name.toLowerCase().replace(/[-\s]/g, "");
          const cleanQuery = mq.replace(/[-\s]/g, "");
          if (cleanModel === cleanQuery || cleanModel.includes(cleanQuery) || cleanQuery.includes(cleanModel)) {
            return {
              makeId: make.MakeId,
              makeName: normaliseNhtsaName(make.MakeName),
              modelId: model.Model_ID,
              modelName: model.Model_Name,
            };
          }
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

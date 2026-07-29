export type PartsAvailabilityScore = "high" | "medium" | "low";

export interface PartsAvailability {
  score: PartsAvailabilityScore;
  label: string;
  description: string;
}

const IMPORT_VOLUME_MAP: Record<string, number> = {
  toyota: 200,
  honda: 180,
  nissan: 150,
  hyundai: 120,
  kia: 100,
  "mercedes-benz": 130,
  bmw: 100,
  ford: 90,
  chevrolet: 80,
  volkswagen: 70,
  mazda: 80,
  lexus: 60,
  subaru: 50,
  mitsubishi: 50,
  audi: 40,
  acura: 40,
  infiniti: 35,
  jeep: 45,
  "land rover": 40,
  buick: 30,
  byd: 40,
  mg: 35,
  chery: 35,
  geely: 35,
  gac: 25,
  changan: 25,
  haval: 25,
  yamaha: 90,
  kawasaki: 50,
  bajaj: 100,
  tvs: 80,
  suzuki: 60,
  piaggio: 40,
  man: 20,
  sinotruk: 20,
  yutong: 15,
  "king long": 15,
  zhongtong: 10,
};

export function getPartsAvailability(makeName: string): PartsAvailability {
  const volume = IMPORT_VOLUME_MAP[makeName.toLowerCase()] ?? 0;

  if (volume >= 100) {
    return {
      score: "high",
      label: "High",
      description:
        "Parts are widely available across Nigerian markets due to high national import volume. Verify local availability in your specific State/LGA.",
    };
  }

  if (volume >= 30) {
    return {
      score: "medium",
      label: "Medium",
      description:
        "Parts are moderately available. Common items may be found locally; specialty parts may require ordering. Verify local availability in your specific State/LGA.",
    };
  }

  return {
    score: "low",
    label: "Low",
    description:
      "Parts availability is limited. Most components may need to be ordered or sourced from specialty dealers. Verify local availability in your specific State/LGA.",
  };
}

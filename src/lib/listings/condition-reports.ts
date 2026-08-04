/**
 * Category-specific condition report schemas.
 *
 * Per constitution: NOT one shared form.
 * Category-specific schemas built from a shared base.
 * AI vision is banned. Free-text is banned. Rigid UI toggles only.
 */

export type ToggleValue = "good" | "fair" | "poor" | "absent";

export interface ConditionField {
  key: string;
  label: string;
  type: "toggle" | "mileage" | "hours" | "select";
  options?: string[];
  required: boolean;
}

// ── Shared base fields (all categories) ────────────────────────────

const BASE_FIELDS: ConditionField[] = [
  { key: "exterior_body", label: "Exterior Body Condition", type: "toggle", required: true },
  { key: "paint_quality", label: "Paint Quality", type: "toggle", required: true },
  { key: "interior_upholstery", label: "Interior Upholstery", type: "toggle", required: true },
  { key: "dashboard_instrument_cluster", label: "Dashboard & Instrument Cluster", type: "toggle", required: true },
  { key: "air_conditioning", label: "Air Conditioning", type: "toggle", required: true },
  { key: "electrical_system", label: "Electrical System (Lights, Windows, Locks)", type: "toggle", required: true },
  { key: "tire_condition", label: "Tire Condition", type: "toggle", required: true },
  { key: "brake_system", label: "Brake System", type: "toggle", required: true },
  { key: "suspension", label: "Suspension", type: "toggle", required: true },
  { key: "engine_bay", label: "Engine Bay", type: "toggle", required: true },
  { key: "transmission", label: "Transmission", type: "toggle", required: true },
  { key: "exhaust_system", label: "Exhaust System", type: "toggle", required: true },
  { key: "undercarriage", label: "Undercarriage", type: "toggle", required: true },
  { key: "frame_structural", label: "Frame / Structural Integrity", type: "toggle", required: true },
  { key: "has_accident_history", label: "Known Accident History", type: "select", options: ["none", "minor", "moderate", "major"], required: true },
];

// ── Cars ───────────────────────────────────────────────────────────

export const CAR_CONDITION_FIELDS: ConditionField[] = [
  ...BASE_FIELDS,
  { key: "trunk_space", label: "Trunk Space", type: "toggle", required: true },
  { key: "windshield_glass", label: "Windshield & Glass", type: "toggle", required: true },
  { key: "wiper_system", label: "Wiper System", type: "toggle", required: false },
];

// ── Motorcycles ────────────────────────────────────────────────────

export const MOTORCYCLE_CONDITION_FIELDS: ConditionField[] = [
  { key: "exterior_body", label: "Exterior Body Condition", type: "toggle", required: true },
  { key: "paint_quality", label: "Paint Quality", type: "toggle", required: true },
  { key: "seat_condition", label: "Seat Condition", type: "toggle", required: true },
  { key: "chain_belt", label: "Chain / Belt Condition", type: "toggle", required: true },
  { key: "spoke_integrity", label: "Spoke Integrity", type: "toggle", required: true },
  { key: "tire_condition", label: "Tire Condition", type: "toggle", required: true },
  { key: "brake_system", label: "Brake System", type: "toggle", required: true },
  { key: "suspension", label: "Suspension", type: "toggle", required: true },
  { key: "engine_bay", label: "Engine Condition", type: "toggle", required: true },
  { key: "transmission", label: "Transmission / Gearbox", type: "toggle", required: true },
  { key: "exhaust_system", label: "Exhaust System", type: "toggle", required: true },
  { key: "cold_start_smoke", label: "Cold-Start Smoke Colour", type: "select", options: ["none", "white", "blue", "black"], required: true },
  { key: "electrical_system", label: "Electrical System (Lights, Indicators, Horn)", type: "toggle", required: true },
  { key: "frame_structural", label: "Frame / Chassis Integrity", type: "toggle", required: true },
  { key: "has_accident_history", label: "Known Accident History", type: "select", options: ["none", "minor", "moderate", "major"], required: true },
];

// ── Tricycles (Keke) ──────────────────────────────────────────────

export const TRICYCLE_CONDITION_FIELDS: ConditionField[] = [
  { key: "exterior_body", label: "Body / Canopy Condition", type: "toggle", required: true },
  { key: "paint_quality", label: "Paint Quality", type: "toggle", required: true },
  { key: "seat_condition", label: "Seat Condition", type: "toggle", required: true },
  { key: "tire_condition", label: "Tire Condition (3 wheels)", type: "toggle", required: true },
  { key: "brake_system", label: "Brake System", type: "toggle", required: true },
  { key: "suspension", label: "Suspension", type: "toggle", required: true },
  { key: "engine_bay", label: "Engine Condition", type: "toggle", required: true },
  { key: "transmission", label: "Transmission", type: "toggle", required: true },
  { key: "exhaust_system", label: "Exhaust System", type: "toggle", required: true },
  { key: "chain_belt", label: "Chain / Belt Condition", type: "toggle", required: true },
  { key: "spoke_integrity", label: "Spoke Integrity", type: "toggle", required: true },
  { key: "steering_mechanism", label: "Steering / Handlebar Mechanism", type: "toggle", required: true },
  { key: "frame_structural", label: "Frame / Structural Integrity", type: "toggle", required: true },
  { key: "electrical_system", label: "Electrical System", type: "toggle", required: true },
  { key: "cold_start_smoke", label: "Cold-Start Smoke Colour", type: "select", options: ["none", "white", "blue", "black"], required: true },
  { key: "has_accident_history", label: "Known Accident History", type: "select", options: ["none", "minor", "moderate", "major"], required: true },
];

// ── Commercial Vehicles ────────────────────────────────────────────

export const COMMERCIAL_CONDITION_FIELDS: ConditionField[] = [
  ...BASE_FIELDS,
  { key: "engine_hours", label: "Engine Hours (Critical — mileage alone is misleading)", type: "hours", required: true },
  { key: "chassis_crossmember", label: "Chassis Crossmember Integrity", type: "toggle", required: true },
  { key: "air_brake_pressure_hold", label: "Air Brake Pressure Hold Test", type: "toggle", required: true },
  { key: "cargo_area", label: "Cargo Area / Bed Condition", type: "toggle", required: true },
  { key: "fifth_wheel_coupling", label: "Fifth Wheel / Coupling (if applicable)", type: "toggle", required: false },
  { key: "hydraulic_system", label: "Hydraulic System (if applicable)", type: "toggle", required: false },
];

// ── Schema lookup ──────────────────────────────────────────────────

export const CONDITION_SCHEMAS: Record<string, ConditionField[]> = {
  car: CAR_CONDITION_FIELDS,
  motorcycle: MOTORCYCLE_CONDITION_FIELDS,
  tricycle: TRICYCLE_CONDITION_FIELDS,
  commercial: COMMERCIAL_CONDITION_FIELDS,
};

export function getConditionFields(domain: string): ConditionField[] {
  const schema = CONDITION_SCHEMAS[domain];
  if (!schema) {
    throw new Error(`Unknown vehicle domain: "${domain}". Valid domains: car, motorcycle, tricycle, commercial.`);
  }
  return schema;
}

/** Full label vocabulary derived from the schemas — single source for display components. */
export function buildConditionLabels(): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const fields of Object.values(CONDITION_SCHEMAS)) {
    for (const field of fields) {
      labels[field.key] = field.label;
    }
  }
  return labels;
}

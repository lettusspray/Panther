import { describe, it, expect } from "vitest";
import {
  CAR_CONDITION_FIELDS,
  MOTORCYCLE_CONDITION_FIELDS,
  TRICYCLE_CONDITION_FIELDS,
  COMMERCIAL_CONDITION_FIELDS,
  getConditionFields,
  type ConditionField,
} from "../src/lib/listings/condition-reports";

const CAR_REQUIRED_KEYS = [
  "exterior_body", "paint_quality", "interior_upholstery",
  "dashboard_instrument_cluster", "air_conditioning", "electrical_system",
  "tire_condition", "brake_system", "suspension", "engine_bay",
  "transmission", "exhaust_system", "undercarriage", "frame_structural",
  "has_accident_history",
];

const ALL_CATEGORIES = [
  { name: "car", fields: CAR_CONDITION_FIELDS },
  { name: "motorcycle", fields: MOTORCYCLE_CONDITION_FIELDS },
  { name: "tricycle", fields: TRICYCLE_CONDITION_FIELDS },
  { name: "commercial", fields: COMMERCIAL_CONDITION_FIELDS },
] as const;

function fieldKeys(fields: ConditionField[]): string[] {
  return fields.map((f) => f.key);
}

describe("condition-reports", () => {
  // ── Car schema ──────────────────────────────────────────────────

  describe("car schema", () => {
    it("contains all BASE_FIELDS", () => {
      const keys = fieldKeys(CAR_CONDITION_FIELDS);
      for (const key of CAR_REQUIRED_KEYS) {
        expect(keys).toContain(key);
      }
    });

    it("has trunk_space, windshield_glass, wiper_system", () => {
      const keys = fieldKeys(CAR_CONDITION_FIELDS);
      expect(keys).toContain("trunk_space");
      expect(keys).toContain("windshield_glass");
      expect(keys).toContain("wiper_system");
    });
  });

  // ── Motorcycle schema ───────────────────────────────────────────

  describe("motorcycle schema", () => {
    it("has constitution-required fields", () => {
      const keys = fieldKeys(MOTORCYCLE_CONDITION_FIELDS);
      expect(keys).toContain("chain_belt");
      expect(keys).toContain("spoke_integrity");
      expect(keys).toContain("cold_start_smoke");
      expect(keys).toContain("seat_condition");
    });
  });

  // ── Tricycle schema ─────────────────────────────────────────────

  describe("tricycle schema", () => {
    it("has frame_structural, paint_quality, suspension, transmission, exhaust_system", () => {
      const keys = fieldKeys(TRICYCLE_CONDITION_FIELDS);
      expect(keys).toContain("frame_structural");
      expect(keys).toContain("paint_quality");
      expect(keys).toContain("suspension");
      expect(keys).toContain("transmission");
      expect(keys).toContain("exhaust_system");
    });
  });

  // ── Commercial schema ───────────────────────────────────────────

  describe("commercial schema", () => {
    it("has constitution-required fields", () => {
      const keys = fieldKeys(COMMERCIAL_CONDITION_FIELDS);
      expect(keys).toContain("engine_hours");
      expect(keys).toContain("chassis_crossmember");
      expect(keys).toContain("air_brake_pressure_hold");
    });
  });

  // ── getConditionFields ──────────────────────────────────────────

  describe("getConditionFields", () => {
    it("returns car fields", () => {
      expect(getConditionFields("car")).toBe(CAR_CONDITION_FIELDS);
    });

    it("returns motorcycle fields", () => {
      expect(getConditionFields("motorcycle")).toBe(MOTORCYCLE_CONDITION_FIELDS);
    });

    it("throws on unknown domain", () => {
      expect(() => getConditionFields("unknown")).toThrow('Unknown vehicle domain: "unknown"');
    });
  });

  // ── Toggle option invariants ────────────────────────────────────

  describe("all toggle fields have standard options", () => {
    for (const { name, fields } of ALL_CATEGORIES) {
      it(`${name} toggle fields use ["good", "fair", "poor", "absent"]`, () => {
        for (const field of fields) {
          if (field.type === "toggle") {
            expect(field.options).toBeUndefined();
          }
        }
      });

      it(`${name} select fields have valid options`, () => {
        for (const field of fields) {
          if (field.type === "select" && field.options) {
            expect(field.options.length).toBeGreaterThan(0);
          }
        }
      });
    }
  });

  // ── Required field count ────────────────────────────────────────

  describe("every schema has at least 10 required fields", () => {
    for (const { name, fields } of ALL_CATEGORIES) {
      it(`${name} has >= 10 required fields`, () => {
        const required = fields.filter((f) => f.required);
        expect(required.length).toBeGreaterThanOrEqual(10);
      });
    }
  });

  // ── No free-text fields ─────────────────────────────────────────

  describe("no free-text fields", () => {
    for (const { name, fields } of ALL_CATEGORIES) {
      it(`${name} has no field with type "text"`, () => {
        for (const field of fields) {
          expect(field.type).not.toBe("text");
        }
      });
    }
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock crawl4ai module to avoid real API calls
vi.mock("../src/lib/data/crawl4ai", () => ({
  crawlHtml: vi.fn(),
  crawlMarkdown: vi.fn(),
  extractTables: vi.fn(),
  tableToKeyValue: vi.fn(),
  parseNumeric: vi.fn(),
}));

import { crawlEvDatabase, discoverEvUrls, toVehicleData } from "../src/lib/data/ev-database";
import * as crawl4ai from "../src/lib/data/crawl4ai";

// ── Test HTML (ev-database.org structure) ─────────────────────────

const TESLA_MODEL_3_HTML = `
<html>
<table>
  <tr><td>Nominal Capacity *</td><td>64.0 kWh</td></tr>
  <tr><td>Battery Type</td><td>Lithium-ion</td></tr>
  <tr><td>Architecture</td><td>400 V</td></tr>
</table>
<table>
  <tr><td>Useable Capacity*</td><td>60.0 kWh</td></tr>
  <tr><td>Cathode Material</td><td>LFP</td></tr>
</table>
<table>
  <tr><td>Charge Power (max)</td><td>175 kW DC</td></tr>
  <tr><td>Charge Power (10-80%)</td><td>110 kW DC</td></tr>
  <tr><td>Charge Time (45->360 km)</td><td>24 min</td></tr>
</table>
<table>
  <tr><td>Charge Port</td><td>CCS</td></tr>
</table>
<table>
  <tr><td>Acceleration 0 - 100 km/h</td><td>6.2 sec</td></tr>
  <tr><td>Top Speed</td><td>201 km/h</td></tr>
  <tr><td>Electric Range</td><td>450 km</td></tr>
</table>
<table>
  <tr><td>Total Power</td><td>208 kW (283 PS)</td></tr>
  <tr><td>Total Torque</td><td>420 Nm</td></tr>
  <tr><td>Drive</td><td>Rear</td></tr>
</table>
<table>
  <tr><td>Vehicle Consumption</td><td>112 Wh/km</td></tr>
</table>
<table>
  <tr><td>Length</td><td>4720 mm</td></tr>
  <tr><td>Width</td><td>1850 mm</td></tr>
  <tr><td>Height</td><td>1440 mm</td></tr>
  <tr><td>Wheelbase</td><td>2875 mm</td></tr>
  <tr><td>Weight Unladen (EU)</td><td>1847 kg</td></tr>
</table>
<table>
  <tr><td>Cargo Volume</td><td>594 L</td></tr>
  <tr><td>Cargo Volume Frunk</td><td>88 L</td></tr>
</table>
<table>
  <tr><td>Seats</td><td>5 people</td></tr>
  <tr><td>Platform</td><td>Tesla 3/Y</td></tr>
</table>
<table>
  <tr><td>Charge Power</td><td>11 kW AC</td></tr>
</table>
</html>
`;

const BYD_ATTO_3_HTML = `
<html>
<table>
  <tr><td>Nominal Capacity *</td><td>60.5 kWh</td></tr>
  <tr><td>Useable Capacity*</td><td>58.1 kWh</td></tr>
  <tr><td>Electric Range</td><td>420 km</td></tr>
  <tr><td>Charge Power (max)</td><td>80 kW DC</td></tr>
  <tr><td>Total Power</td><td>150 kW (204 PS)</td></tr>
  <tr><td>Total Torque</td><td>310 Nm</td></tr>
  <tr><td>Acceleration 0 - 100 km/h</td><td>7.3 sec</td></tr>
  <tr><td>Top Speed</td><td>160 km/h</td></tr>
  <tr><td>Drive</td><td>Front</td></tr>
  <tr><td>Length</td><td>4455 mm</td></tr>
  <tr><td>Width</td><td>1875 mm</td></tr>
  <tr><td>Height</td><td>1615 mm</td></tr>
  <tr><td>Weight Unladen (EU)</td><td>1740 kg</td></tr>
  <tr><td>Seats</td><td>5 people</td></tr>
  <tr><td>Cargo Volume</td><td>440 L</td></tr>
</table>
</html>
`;

// ── Tests ─────────────────────────────────────────────────────────

describe("ev-database.org Crawler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("crawlEvDatabase", () => {
    it("parses Tesla Model 3 specs from HTML", async () => {
      vi.mocked(crawl4ai.crawlHtml).mockResolvedValue([
        { url: "https://ev-database.org/car/3403/Tesla-Model-3-RWD", html: TESLA_MODEL_3_HTML, success: true },
      ]);
      vi.mocked(crawl4ai.extractTables).mockImplementation((html: string) => {
        // Simple mock: extract tables from the test HTML
        const tables: string[][][] = [];
        const tableRegex = /<table>([\s\S]*?)<\/table>/g;
        let match;
        while ((match = tableRegex.exec(html)) !== null) {
          const rows: string[][] = [];
          const rowRegex = /<tr>([\s\S]*?)<\/tr>/g;
          let rowMatch;
          while ((rowMatch = rowRegex.exec(match[1])) !== null) {
            const cells: string[] = [];
            const cellRegex = /<td>([\s\S]*?)<\/td>/g;
            let cellMatch;
            while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
              cells.push(cellMatch[1].trim());
            }
            if (cells.length > 0) rows.push(cells);
          }
          if (rows.length > 0) tables.push(rows);
        }
        return tables;
      });
      vi.mocked(crawl4ai.tableToKeyValue).mockImplementation((rows: string[][]) => {
        const result: Record<string, string> = {};
        for (const row of rows) {
          if (row.length >= 2) {
            result[row[0]] = row.slice(1).join(" ");
          }
        }
        return result;
      });
      vi.mocked(crawl4ai.parseNumeric).mockImplementation((v: string) => {
        if (!v || v === "No Data" || v === "-") return null;
        const match = v.match(/([\d,.]+)/);
        if (!match) return null;
        const num = parseFloat(match[1].replace(/,/g, ""));
        return isNaN(num) ? null : num;
      });

      const vehicles = await crawlEvDatabase([
        "https://ev-database.org/car/3403/Tesla-Model-3-RWD",
      ]);

      expect(vehicles).toHaveLength(1);
      const v = vehicles[0];
      expect(v.external_id).toBe("3403");
      expect(v.brand).toBe("Tesla");
      expect(v.model).toBe("Model 3 RWD");
      expect(v.battery_nominal_kwh).toBe(64);
      expect(v.battery_usable_kwh).toBe(60);
      expect(v.range_km).toBe(450);
      expect(v.dc_charge_max_kw).toBe(175);
      expect(v.power_kw).toBe(208);
      expect(v.torque_nm).toBe(420);
      expect(v.acceleration_0_100_sec).toBe(6.2);
      expect(v.top_speed_kmh).toBe(201);
      expect(v.drivetrain).toBe("Rear");
      expect(v.seats).toBe(5);
      expect(v.length_mm).toBe(4720);
      expect(v.width_mm).toBe(1850);
      expect(v.height_mm).toBe(1440);
      expect(v.curb_weight_kg).toBe(1847);
      expect(v.cargo_liters).toBe(594);
      expect(v.frunk_liters).toBe(88);
      expect(v.platform).toBe("Tesla 3/Y");
      expect(v.source_url).toContain("ev-database.org");
      // New fields
      expect(v.battery_type).toBe("Lithium-ion");
      expect(v.battery_architecture).toBe("400 V");
      expect(v.battery_cathode).toBe("LFP");
      expect(v.ac_charge_port).toBe("CCS");
      expect(v.dc_charge_port).toBe("CCS");
      // Fields not in mock HTML — default to empty/null
      expect(v.battery_name).toBe("");
      expect(v.car_body).toBe("");
      expect(v.segment).toBe("");
    });

    it("returns empty array for empty input", async () => {
      const vehicles = await crawlEvDatabase([]);
      expect(vehicles).toEqual([]);
    });

    it("skips failed crawl results", async () => {
      vi.mocked(crawl4ai.crawlHtml).mockResolvedValue([
        { url: "https://example.com", html: "", success: false, error: "timeout" },
      ]);
      vi.mocked(crawl4ai.extractTables).mockReturnValue([]);

      const vehicles = await crawlEvDatabase(["https://example.com"]);
      expect(vehicles).toEqual([]);
    });
  });

  describe("toVehicleData", () => {
    it("converts EvSpecs to generic VehicleData", () => {
      const evSpecs = {
        external_id: "3403",
        brand: "Tesla",
        model: "Model 3 RWD",
        category: "ev" as const,
        battery_nominal_kwh: 64,
        battery_usable_kwh: 60,
        battery_type: "Lithium-ion",
        battery_cells: 0,
        battery_architecture: "400 V",
        battery_nominal_voltage: "",
        battery_pack_config: "",
        battery_cathode: "LFP",
        battery_form_factor: "Prismatic",
        battery_name: "CATL 6M",
        battery_warranty_years: 8,
        battery_warranty_km: 160000,
        range_km: 450,
        efficiency_wh_per_km: 112,
        real_range_city_cold: null,
        real_range_highway_cold: null,
        real_range_combined_cold: null,
        real_range_city_mild: null,
        real_range_highway_mild: null,
        real_range_combined_mild: null,
        wltp_range_km: null,
        wltp_consumption: null,
        wltp_fuel_equivalent: "",
        ac_charge_port: "CCS",
        ac_port_location: "",
        ac_charge_power_kw: 11,
        ac_charge_time: "",
        dc_charge_port: "CCS",
        dc_port_location: "",
        dc_charge_max_kw: 175,
        dc_charge_10_80_kw: 110,
        dc_charge_time: "",
        dc_charge_speed: "",
        ac_charge_speed: "",
        autocharge_supported: true,
        plug_charge_supported: false,
        preconditioning_possible: true,
        preconditioning_auto_nav: true,
        acceleration_0_100_sec: 6.2,
        top_speed_kmh: 201,
        power_kw: 208,
        power_hp: 283,
        torque_nm: 420,
        drivetrain: "Rear",
        v2l_supported: false,
        v2l_output_kw: null,
        v2l_exterior_outlets: "",
        v2l_interior_outlets: "",
        v2h_ac_supported: false,
        v2h_dc_supported: false,
        v2g_ac_supported: false,
        v2g_dc_supported: false,
        co2_emissions: 0,
        fuel_equivalent_l_100km: null,
        length_mm: 4720,
        width_mm: 1850,
        width_with_mirrors_mm: null,
        height_mm: 1440,
        wheelbase_mm: 2875,
        curb_weight_kg: 1847,
        gross_weight_kg: null,
        max_payload_kg: null,
        cargo_liters: 594,
        cargo_max_liters: null,
        frunk_liters: 88,
        roof_load_kg: null,
        tow_hitch_possible: false,
        towing_unbraked_kg: null,
        towing_braked_kg: null,
        vertical_load_max_kg: null,
        ncap_stars: null,
        ncap_adult: null,
        ncap_child: null,
        ncap_pedestrian: null,
        ncap_assist: null,
        ncap_year: null,
        seats: 5,
        isofix_seats: "",
        turning_circle_m: null,
        platform: "Tesla 3/Y",
        ev_dedicated_platform: true,
        car_body: "Sedan",
        segment: "D - Large",
        roof_rails: false,
        heat_pump: true,
        hp_standard: true,
        long_distance_rating: null,
        one_stop_range_km: null,
        price_eur: null,
        source_url: "https://ev-database.org/car/3403/Tesla-Model-3-RWD",
      };

      const data = toVehicleData(evSpecs);
      expect(data.external_id).toBe("3403");
      expect(data.brand).toBe("Tesla");
      expect(data.model).toBe("Model 3 RWD");
      expect(data.category).toBe("ev");
      expect(data.specs.battery_nominal_kwh).toBe(64);
      expect(data.specs.range_km).toBe(450);
      expect(data.specs.power_kw).toBe(208);
      expect(data.specs.dc_charge_max_kw).toBe(175);
      expect(data.specs.battery_cathode).toBe("LFP");
      expect(data.specs.v2l_supported).toBe(false);
      expect(data.specs.heat_pump).toBe(true);
      expect(data.specs.price_eur).toBeNull();
    });
  });
});

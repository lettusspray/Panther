import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock crawl4ai module
vi.mock("../src/lib/data/crawl4ai", () => ({
  crawlHtml: vi.fn(),
  crawlMarkdown: vi.fn(),
  extractTables: vi.fn(),
  tableToKeyValue: vi.fn(),
  parseNumeric: vi.fn(),
}));

import { crawlAutoData, toVehicleData } from "../src/lib/data/auto-data";
import * as crawl4ai from "../src/lib/data/crawl4ai";

// ── Test HTML (auto-data.net structure) ───────────────────────────

const TOYOTA_CAMRY_HTML = `
<html>
<table>
  <tr><td>Brand</td><td>Toyota</td></tr>
  <tr><td>Model</td><td>Camry</td></tr>
  <tr><td>Generation</td><td>Camry XV70</td></tr>
  <tr><td>Modification (Engine)</td><td>2.5 Hybrid 218 Hp</td></tr>
  <tr><td>Start of production</td><td>2017 year</td></tr>
  <tr><td>End of production</td><td>2023 year</td></tr>
  <tr><td>Powertrain Architecture</td><td>Hybrid</td></tr>
  <tr><td>Body type</td><td>Sedan</td></tr>
  <tr><td>Seats</td><td>5</td></tr>
  <tr><td>Doors</td><td>4</td></tr>
</table>
<table>
  <tr><td>Fuel Type</td><td>Petrol (Gasoline) + Electric</td></tr>
  <tr><td>Acceleration 0 - 100 km/h</td><td>7.5 sec</td></tr>
  <tr><td>Maximum speed</td><td>180 km/h</td></tr>
</table>
<table>
  <tr><td>Power</td><td>218 Hp @ 5700 rpm.</td></tr>
  <tr><td>Torque</td><td>221 Nm @ 3600-5200 rpm.</td></tr>
  <tr><td>Engine displacement</td><td>2487 cm3</td></tr>
  <tr><td>Number of cylinders</td><td>4</td></tr>
  <tr><td>Engine configuration</td><td>Inline</td></tr>
  <tr><td>Engine Model/Code</td><td>A25A-FXS</td></tr>
  <tr><td>Valvetrain</td><td>DOHC</td></tr>
  <tr><td>Engine aspiration</td><td>Naturally aspirated engine</td></tr>
</table>
<table>
  <tr><td>Kerb Weight</td><td>1590 kg</td></tr>
  <tr><td>Max. weight</td><td>2050 kg</td></tr>
  <tr><td>Trunk (boot) space - minimum</td><td>524 l</td></tr>
  <tr><td>Fuel tank capacity</td><td>50 l</td></tr>
</table>
<table>
  <tr><td>Length</td><td>4885 mm</td></tr>
  <tr><td>Width</td><td>1840 mm</td></tr>
  <tr><td>Height</td><td>1455 mm</td></tr>
  <tr><td>Wheelbase</td><td>2825 mm</td></tr>
</table>
<table>
  <tr><td>Drive wheel</td><td>Front wheel drive</td></tr>
  <tr><td>Number of gears and type of gearbox</td><td>E-CVT</td></tr>
</table>
</html>
`;

// ── Tests ─────────────────────────────────────────────────────────

describe("auto-data.net Crawler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("crawlAutoData", () => {
    it("parses Toyota Camry specs from HTML", async () => {
      vi.mocked(crawl4ai.crawlHtml).mockResolvedValue([
        { url: "https://auto-data.net/en/toyota-camry-xv70-218-hp-3928", html: TOYOTA_CAMRY_HTML, success: true },
      ]);
      vi.mocked(crawl4ai.extractTables).mockImplementation((html: string) => {
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

      const vehicles = await crawlAutoData([
        "https://auto-data.net/en/toyota-camry-xv70-218-hp-3928",
      ]);

      expect(vehicles).toHaveLength(1);
      const v = vehicles[0];
      expect(v.external_id).toBe("3928");
      expect(v.brand).toBe("Toyota");
      expect(v.model).toBe("Camry");
      expect(v.generation).toBe("Camry XV70");
      expect(v.modification).toBe("2.5 Hybrid 218 Hp");
      expect(v.year_start).toBe(2017);
      expect(v.year_end).toBe(2023);
      expect(v.category).toBe("car");
      expect(v.body_type).toBe("Sedan");
      expect(v.seats).toBe(5);
      expect(v.doors).toBe(4);
      expect(v.fuel_type).toContain("Petrol");
      expect(v.power_hp).toBe(218);
      expect(v.torque_nm).toBe(221);
      expect(v.engine_displacement_cc).toBe(2487);
      expect(v.engine_cylinders).toBe(4);
      expect(v.engine_configuration).toBe("Inline");
      expect(v.acceleration_0_100_sec).toBe(7.5);
      expect(v.top_speed_kmh).toBe(180);
      expect(v.curb_weight_kg).toBe(1590);
      expect(v.length_mm).toBe(4885);
      expect(v.width_mm).toBe(1840);
      expect(v.height_mm).toBe(1455);
      expect(v.wheelbase_mm).toBe(2825);
      expect(v.drivetrain).toBe("Front wheel drive");
      expect(v.transmission_type).toBe("E-CVT");
    });

    it("returns empty array for empty input", async () => {
      const vehicles = await crawlAutoData([]);
      expect(vehicles).toEqual([]);
    });

    it("skips failed crawl results", async () => {
      vi.mocked(crawl4ai.crawlHtml).mockResolvedValue([
        { url: "https://example.com", html: "", success: false, error: "timeout" },
      ]);
      vi.mocked(crawl4ai.extractTables).mockReturnValue([]);

      const vehicles = await crawlAutoData(["https://example.com"]);
      expect(vehicles).toEqual([]);
    });

    it("categorizes SUV body types correctly", async () => {
      const suvHtml = TOYOTA_CAMRY_HTML.replace("Sedan", "SUV");
      vi.mocked(crawl4ai.crawlHtml).mockResolvedValue([
        { url: "https://auto-data.net/en/toyota-rav4-3928", html: suvHtml, success: true },
      ]);

      // Re-mock with the same pattern but "SUV" body type
      vi.mocked(crawl4ai.extractTables).mockImplementation((html: string) => {
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
          if (row.length >= 2) result[row[0]] = row.slice(1).join(" ");
        }
        return result;
      });
      vi.mocked(crawl4ai.parseNumeric).mockImplementation((v: string) => {
        if (!v || v === "No Data" || v === "-") return null;
        const match = v.match(/([\d,.]+)/);
        if (!match) return null;
        return parseFloat(match[1].replace(/,/g, ""));
      });

      const vehicles = await crawlAutoData(["https://auto-data.net/en/toyota-rav4-3928"]);
      expect(vehicles[0].category).toBe("suv");
    });
  });

  describe("toVehicleData", () => {
    it("converts AutoDataSpecs to generic VehicleData", () => {
      const specs = {
        external_id: "3928",
        brand: "Toyota",
        model: "Camry",
        generation: "XV70",
        modification: "2.5 Hybrid",
        year_start: 2017,
        year_end: 2023,
        category: "car" as const,
        body_type: "Sedan",
        seats: 5,
        doors: 4,
        fuel_type: "Hybrid",
        powertrain_architecture: "Hybrid",
        power_hp: 218,
        power_kw: 163,
        torque_nm: 221,
        power_per_litre: 87.6,
        engine_displacement_cc: 2487,
        engine_cylinders: 4,
        engine_configuration: "Inline",
        engine_code: "A25A-FXS",
        bore_mm: 87.5,
        stroke_mm: 103.4,
        compression_ratio: "14.0:1",
        valvetrain: "DOHC",
        aspiration: "Naturally aspirated",
        acceleration_0_100_sec: 7.5,
        top_speed_kmh: 180,
        transmission_type: "E-CVT",
        transmission_gears: null,
        drivetrain: "Front wheel drive",
        curb_weight_kg: 1590,
        gross_weight_kg: 2050,
        length_mm: 4885,
        width_mm: 1840,
        height_mm: 1455,
        wheelbase_mm: 2825,
        front_track_mm: 1585,
        rear_track_mm: 1595,
        drag_coefficient: 0.28,
        trunk_liters: 524,
        fuel_tank_liters: 50,
        turning_circle_m: 11.2,
        engine_layout: "Front transverse",
        fuel_injection: "Direct injection",
        engine_systems: "",
        num_valves_per_cylinder: 4,
        front_suspension: "MacPherson",
        rear_suspension: "Multi-link",
        front_brakes: "Ventilated disc",
        rear_brakes: "Disc",
        steering_type: "Electric assist",
        power_steering: "Electric",
        tire_size: "235/45 R18",
        wheel_rim_size: "18x8",
        assisting_systems: "ABS, ESC, Traction Control",
        source_url: "https://auto-data.net/en/toyota-camry-3928",
      };

      const data = toVehicleData(specs);
      expect(data.external_id).toBe("3928");
      expect(data.brand).toBe("Toyota");
      expect(data.model).toBe("Camry");
      expect(data.year).toBe(2017);
      expect(data.specs.generation).toBe("XV70");
      expect(data.specs.power_hp).toBe(218);
      expect(data.specs.engine_displacement_cc).toBe(2487);
      expect(data.specs.body_type).toBe("Sedan");
    });
  });
});

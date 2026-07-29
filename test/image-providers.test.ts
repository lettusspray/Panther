import { vi, beforeEach, afterEach } from "vitest";
import { searchUnsplash } from "@/lib/images/providers/unsplash";
import { searchPexels } from "@/lib/images/providers/pexels";
import { searchCarImages } from "@/lib/images/providers/carimages";
import {
  searchSourceSplash,
  getRandomImageUrl,
} from "@/lib/images/providers/sourcesplash";

function mockFetchOk(json: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Map<string, string>(),
    json: async () => json,
    text: async () => "",
  };
}

function mockFetchFail(status: number) {
  return {
    ok: false,
    status,
    headers: new Map<string, string>(),
    json: async () => ({}),
    text: async () => "Error",
  };
}

// ── Unsplash ───────────────────────────────────────────────────

describe("Unsplash Provider", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns images when API responds 200", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockFetchOk({
        total: 1,
        total_pages: 1,
        results: [
          {
            id: "abc",
            width: 1920,
            height: 1080,
            color: "#000000",
            alt_description: "test photo",
            user: { name: "Test", links: { html: "https://unsplash.com/test" } },
            urls: {
              raw: "https://images.unsplash.com/raw",
              small: "https://images.unsplash.com/small",
              regular: "https://images.unsplash.com/regular",
              full: "https://images.unsplash.com/full",
            },
          },
        ],
      }),
    );

    const result = await searchUnsplash({ query: "Toyota Camry" }, "test-key");

    expect(result.images).toHaveLength(1);
    expect(result.images[0].provider).toBe("unsplash");
    expect(result.images[0].id).toBe("abc");
    expect(result.images[0].photographer).toBe("Test");
  });

  it("returns empty when API key is empty", async () => {
    const result = await searchUnsplash({ query: "Toyota Camry" }, "");
    expect(result.images).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns empty when API responds non-200", async () => {
    fetchSpy.mockResolvedValueOnce(mockFetchFail(403));

    const result = await searchUnsplash(
      { query: "Toyota Camry" },
      "test-key",
    );

    expect(result.images).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("passes orientation and color params", async () => {
    fetchSpy.mockResolvedValueOnce(mockFetchOk({ total: 0, total_pages: 0, results: [] }));

    await searchUnsplash(
      { query: "Toyota Camry", orientation: "landscape", color: "red" },
      "test-key",
    );

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("orientation=landscape");
    expect(url).toContain("color=red");
  });

  it("per-page capped at 30", async () => {
    fetchSpy.mockResolvedValueOnce(mockFetchOk({ total: 0, total_pages: 0, results: [] }));

    await searchUnsplash(
      { query: "Toyota Camry", perPage: 100 },
      "test-key",
    );

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("per_page=30");
  });

  it("Accept-Version header sent", async () => {
    fetchSpy.mockResolvedValueOnce(mockFetchOk({ total: 0, total_pages: 0, results: [] }));

    await searchUnsplash({ query: "Toyota Camry" }, "test-key");

    const headers = fetchSpy.mock.calls[0][1].headers;
    expect(headers["Accept-Version"]).toBe("v1");
    expect(headers["Authorization"]).toBe("Client-ID test-key");
  });
});

// ── Pexels ─────────────────────────────────────────────────────

describe("Pexels Provider", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function pexelsResponse(photos: unknown[] = []) {
    return mockFetchOk({
      total_results: photos.length,
      page: 1,
      per_page: 10,
      photos,
    });
  }

  it("URL includes /v1/search (not just /search)", async () => {
    fetchSpy.mockResolvedValueOnce(pexelsResponse());

    await searchPexels({ query: "Toyota Camry" }, "test-key");

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("/v1/search");
    expect(url).not.toMatch(/(?<!\/v1)\/search\?/);
  });

  it("returns images when API responds 200", async () => {
    fetchSpy.mockResolvedValueOnce(
      pexelsResponse([
        {
          id: 123,
          width: 1920,
          height: 1080,
          url: "https://pexels.com/photo/123",
          photographer: "Test Pexels",
          photographer_url: "https://pexels.com/test",
          alt: "test photo",
          src: {
            small: "https://images.pexels.com/small",
            medium: "https://images.pexels.com/medium",
            large: "https://images.pexels.com/large",
            original: "https://images.pexels.com/original",
          },
        },
      ]),
    );

    const result = await searchPexels({ query: "Toyota Camry" }, "test-key");

    expect(result.images).toHaveLength(1);
    expect(result.images[0].provider).toBe("pexels");
    expect(result.images[0].id).toBe("123");
    expect(result.images[0].photographer).toBe("Test Pexels");
  });

  it('maps orientation "squarish" to "square"', async () => {
    fetchSpy.mockResolvedValueOnce(pexelsResponse());

    await searchPexels(
      { query: "Toyota Camry", orientation: "squarish" },
      "test-key",
    );

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("orientation=square");
    expect(url).not.toContain("orientation=squarish");
  });

  it("maps color values (magenta→pink, teal→turquoise)", async () => {
    fetchSpy.mockResolvedValueOnce(pexelsResponse());

    await searchPexels(
      { query: "Toyota Camry", color: "magenta" },
      "test-key",
    );

    const url1 = fetchSpy.mock.calls[0][0] as string;
    expect(url1).toContain("color=pink");

    fetchSpy.mockResolvedValueOnce(pexelsResponse());

    await searchPexels(
      { query: "Toyota Camry", color: "teal" },
      "test-key",
    );

    const url2 = fetchSpy.mock.calls[1][0] as string;
    expect(url2).toContain("color=turquoise");
  });
});

// ── CarImages ──────────────────────────────────────────────────

describe("CarImages Provider", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("accepts structured make/model/year params", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockFetchOk({
        url: "https://carimagesapi.com/signed?make=Toyota&model=Camry&year=2022&width=800&format=webp",
      }),
    );

    const result = await searchCarImages(
      {
        query: "2022 Toyota Camry",
        make: "Toyota",
        model: "Camry",
        year: 2022,
      },
      "ci_test",
      "test-secret",
    );

    expect(result.images).toHaveLength(1);
    expect(result.images[0].provider).toBe("carimages");
    expect(result.images[0].alt).toContain("Toyota");
    expect(result.images[0].alt).toContain("Camry");
    expect(result.images[0].alt).toContain("2022");
  });

  it("returns empty when API key is empty", async () => {
    const result = await searchCarImages(
      { query: "Toyota Camry", make: "Toyota", model: "Camry" },
      "",
      "",
    );
    expect(result.images).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("URL widths are correctly substituted (small=400, large=1200)", async () => {
    const signedUrl =
      "https://carimagesapi.com/signed?make=Toyota&width=800&format=webp";
    fetchSpy.mockResolvedValueOnce(mockFetchOk({ url: signedUrl }));

    const result = await searchCarImages(
      { query: "Toyota Camry", make: "Toyota", model: "Camry" },
      "ci_test",
      "test-secret",
    );

    expect(result.images[0].urls.small).toBe(
      "https://carimagesapi.com/signed?make=Toyota&width=400&format=webp",
    );
    expect(result.images[0].urls.medium).toBe(signedUrl);
    expect(result.images[0].urls.large).toBe(
      "https://carimagesapi.com/signed?make=Toyota&width=1200&format=webp",
    );
  });
});

// ── SourceSplash ───────────────────────────────────────────────

describe("SourceSplash Provider", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("maps photos array from response (not images)", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockFetchOk({
        query: "Toyota Camry",
        photos: [
          {
            id: "ss-1",
            url: "https://sourcesplash.com/img/test.jpg",
            thumbnail: "https://sourcesplash.com/thumb/test.jpg",
            width: 1920,
            height: 1080,
            author: "Test Author",
            author_url: "https://sourcesplash.com/author",
            source: "unsplash",
            description: "A test image",
          },
        ],
        total_results: 1,
        page: 1,
        per_page: 15,
      }),
    );

    const result = await searchSourceSplash({ query: "Toyota Camry" });

    expect(result.images).toHaveLength(1);
    expect(result.images[0].provider).toBe("sourcesplash");
    expect(result.images[0].alt).toBe("A test image");
    expect(result.images[0].photographer).toBe("Test Author");
  });

  it("returns empty when fetch fails", async () => {
    fetchSpy.mockResolvedValueOnce(mockFetchFail(500));

    const result = await searchSourceSplash({ query: "Toyota Camry" });
    expect(result.images).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("getRandomImageUrl returns correct format", () => {
    const url = getRandomImageUrl("Toyota Camry", 800, 600);
    expect(url).toBe(
      "https://www.sourcesplash.com/i/random?q=Toyota+Camry&w=800&h=600",
    );
  });
});

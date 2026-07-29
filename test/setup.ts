// Mock import.meta.env for all tests
import { vi } from "vitest";

vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost/testdb");
vi.stubEnv("HYPERDRIVE_ID", "test-hyperdrive");
vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "test-cf-account");
vi.stubEnv("CLOUDFLARE_API_TOKEN", "test-cf-token");
vi.stubEnv("BETTER_AUTH_SECRET", "test-auth-secret-32-chars-minimum!");
vi.stubEnv("BETTER_AUTH_URL", "http://localhost:4321");
vi.stubEnv("NHTSA_VPIC_API_URL", "https://vpic.nhtsa.dot.gov/api");
vi.stubEnv("AUTO_DEV_API_URL", "https://api.auto.dev");
vi.stubEnv("AUTO_DEV_API_KEY", "sk_ad_test");
vi.stubEnv("SCRAPER_API_KEYS", "test-key-1,test-key-2");
vi.stubEnv("GROQ_API_KEY", "test-groq");
vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-unsplash");
vi.stubEnv("PEXELS_API_KEY", "test-pexels");
vi.stubEnv("CARIMAGES_API_KEY", "ci_test");
vi.stubEnv("CARIMAGES_API_SECRET", "test-secret");
vi.stubEnv("SOURCESPLASH_API_KEY", "ss_test");
vi.stubEnv("CF_IMAGES_ACCOUNT", "test-cf-images");
vi.stubEnv("CRAWL4AI_API_URL", "https://crawl4ai-test.up.railway.app");
vi.stubEnv("CRAWL4AI_API_KEY", "test-crawl4ai-key");

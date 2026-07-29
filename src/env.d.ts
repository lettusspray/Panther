/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly DATABASE_URL: string;
  readonly HYPERDRIVE_ID: string;
  readonly HYPERDRIVE_CONNECTION_STRING: string;
  readonly CLOUDFLARE_ACCOUNT_ID: string;
  readonly CLOUDFLARE_API_TOKEN: string;
  readonly BETTER_AUTH_SECRET: string;
  readonly BETTER_AUTH_URL: string;
  readonly WHATSAPP_BUSINESS_NUMBER: string;
  readonly WHATSAPP_VERIFY_TOKEN: string;
  readonly WHATSAPP_PHONE_NUMBER_ID: string;
  readonly WHATSAPP_ACCESS_TOKEN: string;
  readonly WHATSAPP_APP_SECRET: string;
  readonly WHATSAPP_COMMUNITY_LINK: string;
  readonly AUTO_DEV_API_URL: string;
  readonly AUTO_DEV_API_KEY: string;
  readonly SCRAPER_API_KEYS: string;
  readonly GROQ_API_KEY: string;
  readonly UNSPLASH_ACCESS_KEY: string;
  readonly PEXELS_API_KEY: string;
  readonly CARIMAGES_API_KEY: string;
  readonly CARIMAGES_API_SECRET: string;
  readonly SOURCESPLASH_API_KEY: string;
  readonly CF_IMAGES_ACCOUNT: string;
  readonly CF_IMAGES_API_TOKEN: string;
  readonly R2_ACCESS_KEY_ID: string;
  readonly R2_SECRET_ACCESS_KEY: string;
  readonly R2_ACCOUNT_ID: string;
  readonly R2_BUCKET_NAME: string;
  readonly R2_PUBLIC_URL: string;
  readonly CRAWL4AI_API_URL: string;
  readonly CRAWL4AI_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    user: Record<string, unknown> | null;
    session: Record<string, unknown> | null;
  }
}

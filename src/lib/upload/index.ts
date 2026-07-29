/**
 * Upload service: Cloudflare Images for photos, R2 for videos.
 *
 * Constitution §VII: All images through Cloudflare Images for on-the-fly WebP/AVIF.
 * Videos stored in R2 (no equivalent CF Images for video).
 *
 * For dev (no CF env vars), falls back to mocks that return fake URLs.
 */

const CF_IMAGES_API = "https://api.cloudflare.com/client/v4";

export interface ImageUploadResult {
  uploadUrl: string;
  imageId: string;
  deliveryUrl: string;
}

export interface VideoUploadResult {
  uploadUrl: string;
  key: string;
  publicUrl: string;
}

function getCfAccount(): string | undefined {
  try {
    return import.meta.env.CF_IMAGES_ACCOUNT;
  } catch {
    return process?.env?.CF_IMAGES_ACCOUNT;
  }
}

function getCfApiToken(): string | undefined {
  try {
    return import.meta.env.CF_IMAGES_API_TOKEN;
  } catch {
    return process?.env?.CF_IMAGES_API_TOKEN;
  }
}

function getR2Config() {
  const src = typeof import.meta !== "undefined" ? import.meta.env : process?.env ?? {};
  return {
    accountId: (src as Record<string, string>).R2_ACCOUNT_ID ?? (src as Record<string, string>).CLOUDFLARE_ACCOUNT_ID,
    accessKeyId: (src as Record<string, string>).R2_ACCESS_KEY_ID,
    secretAccessKey: (src as Record<string, string>).R2_SECRET_ACCESS_KEY,
    bucketName: (src as Record<string, string>).R2_BUCKET_NAME ?? "panther-images",
    publicUrl: (src as Record<string, string>).R2_PUBLIC_URL ?? "https://pub-xxx.r2.dev",
  };
}

/**
 * Create a Cloudflare Images Direct Creator Upload URL.
 *
 * Client uploads directly to the returned `uploadUrl`.
 * On success, Cloudflare returns the image ID and we derive the delivery URL.
 */
export async function createImageUploadUrl(
  filename?: string,
): Promise<ImageUploadResult> {
  const account = getCfAccount();
  const apiToken = getCfApiToken();

  if (!account || !apiToken) {
    return {
      uploadUrl: "/api/upload/image/mock",
      imageId: `mock-${Date.now()}`,
      deliveryUrl: `https://imagedelivery.net/mock/${Date.now()}/public`,
    };
  }

  const res = await fetch(
    `${CF_IMAGES_API}/accounts/${account}/images/v1/direct_upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...(filename ? { filename } : {}),
        requireSignedURLs: false,
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cloudflare Images direct upload failed: ${res.status} ${err}`);
  }

  const json = await res.json() as {
    result: { uploadURL: string; id: string };
    success: boolean;
  };

  if (!json.success) {
    throw new Error("Cloudflare Images direct upload rejected");
  }

  return {
    uploadUrl: json.result.uploadURL,
    imageId: json.result.id,
    deliveryUrl: `https://imagedelivery.net/${account}/${json.result.id}/public`,
  };
}

/**
 * Create a presigned PUT URL for uploading a video to R2.
 *
 * Client uploads directly to the returned URL.
 */
export async function createVideoUploadUrl(
  filename: string,
  contentType: string,
): Promise<VideoUploadResult> {
  const cfg = getR2Config();

  if (!cfg.accessKeyId || !cfg.secretAccessKey || !cfg.accountId) {
    const key = `mock/${Date.now()}-${filename}`;
    return {
      uploadUrl: "/api/upload/video/mock",
      key,
      publicUrl: `${cfg.publicUrl}/${key}`,
    };
  }

  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");

  const key = `listings/${Date.now()}-${filename}`;

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });

  const command = new PutObjectCommand({
    Bucket: cfg.bucketName,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 3600 });

  return {
    uploadUrl,
    key,
    publicUrl: `${cfg.publicUrl}/${key}`,
  };
}

export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  /** Optional Cloudflare Email Service binding (requires Workers Paid for arbitrary recipients). */
  EMAIL?: { send(message: { to: string | string[]; from: string | { email: string; name?: string }; subject: string; html?: string; text?: string; replyTo?: string; headers?: Record<string, string> }): Promise<unknown> };

  APP_ENV: 'production' | 'staging' | 'development';
  PUBLIC_BASE_URL: string;

  // Secrets (wrangler secret put …). Never exposed to the browser.
  DATA_KEY: string; // base64, 32 bytes — AES-GCM key for delivery details & integration credentials
  TOKEN_SECRET: string; // HMAC key for customer tokens / hashing
  SETUP_TOKEN?: string; // one-time admin bootstrap token
  GEMINI_API_KEY?: string; // optional
  RESEND_API_KEY?: string; // optional: Resend sending key (can also be stored encrypted from Admin → Setup)
  RESEND_WEBHOOK_SECRET?: string; // optional: Resend webhook signing secret (whsec_…)

  // Optional Cloudflare Access hardening for /admin
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;

  // Test-only provider base URL overrides (ignored in production)
  TEST_PROVIDER_BASE?: string;
  RATE_LIMIT_MULTIPLIER?: string;
}

export type AdminUser = { id: string; email: string; name: string; totp_enabled: number };

export type AppContext = { Bindings: Env; Variables: { admin: AdminUser; sessionHash: string } };

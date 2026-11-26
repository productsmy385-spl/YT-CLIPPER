import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dbRepo } from '../../db/repository.ts';

export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export type YouTubeConnectionState =
  | 'NOT_CONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'CHECKING_CONNECTION'
  | 'TOKEN_EXPIRED'
  | 'REAUTH_REQUIRED'
  | 'PERMISSION_MISSING'
  | 'CONNECTION_ERROR'
  | 'DISCONNECTED';

export interface YouTubeChannelProfile {
  id: string;
  title: string;
  customUrl?: string | null;
  thumbnailUrl?: string | null;
  subscribers?: string | null;
  videos?: string | null;
  email?: string | null;
  connectedAt?: string;
  tokenExpiresAt?: string | null;
  canUpload?: boolean;
}

export interface YouTubeStatusReport {
  state: YouTubeConnectionState;
  connected: boolean;
  channel: YouTubeChannelProfile | null;
  scopes: string[];
  lastChecked: string;
  error?: string | null;
  canUpload: boolean;
  canSchedule: boolean;
}

// AES-256-GCM Token Encryption at Rest.
// The key MUST be identical across every deploy, otherwise stored tokens become undecryptable and the channel
// appears disconnected. The legacy default is kept only so tokens encrypted with it remain readable.
const LEGACY_DEFAULT_KEY = 'gta6_shorts_ai_production_oauth_encryption_key_2026';
let warnedAboutKey = false;
function getEncryptionKey(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret && !warnedAboutKey) {
    warnedAboutKey = true;
    console.error('[YouTubeOAuth] TOKEN_ENCRYPTION_KEY is not set; using the legacy built-in key. Set a stable secret in Railway variables.');
  }
  return crypto.createHash('sha256').update(secret || LEGACY_DEFAULT_KEY).digest();
}

export function encryptToken(text: string): string {
  if (!text) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptToken(encryptedData: string): string {
  if (!encryptedData) return '';
  const parts = encryptedData.split(':');
  if (parts.length !== 3) return encryptedData; // legacy plaintext record
  const [ivHex, authTagHex, encHex] = parts;
  const keys = [getEncryptionKey(), crypto.createHash('sha256').update(LEGACY_DEFAULT_KEY).digest()];
  for (const key of keys) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
      return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8');
    } catch {
      // try next key. Records written by processes that ran without .env used the legacy key; they are
      // re-encrypted with the configured key on the next refresh.
    }
  }
  // Previously this returned the ciphertext and sent it to Google as a token. Fail clearly instead.
  throw new OAuthReauthRequiredError(
    'Stored YouTube credentials cannot be decrypted (TOKEN_ENCRYPTION_KEY changed between deploys). Reconnect once and keep the key stable.'
  );
}

/** Raised when the user genuinely has to go through Google consent again. Anything else is treated as transient. */
export class OAuthReauthRequiredError extends Error {
  readonly reauthRequired = true;
}

const G = globalThis as any;
G.__ytRefreshInFlight = G.__ytRefreshInFlight || new Map<string, Promise<string>>();
G.__ytChannelCache = G.__ytChannelCache || new Map<string, { at: number; channel: YouTubeChannelProfile }>();
const CHANNEL_CACHE_MS = 10 * 60 * 1000;

/** The YouTube account whose credentials are most recently updated (ignores token-less placeholder rows). */
function resolveYouTubeConnection(): { account: any; token: any } | null {
  const accounts = (dbRepo.listConnectedAccounts() as any[]).filter((a) => a.platform === 'youtube');
  let best: { account: any; token: any } | null = null;
  for (const account of accounts) {
    const token = dbRepo.getOAuthToken(account.id) as any;
    if (!token) continue;
    if (!best || String(token.updated_at) > String(best.token.updated_at)) best = { account, token };
  }
  return best;
}

export function loadOAuthConfig() {
  const envClientId = process.env.GOOGLE_CLIENT_ID;
  const envClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const envRedirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (envClientId && envClientSecret) {
    return {
      clientId: envClientId.trim(),
      clientSecret: envClientSecret.trim(),
      redirectUri: envRedirectUri?.trim(),
      projectId: process.env.GOOGLE_PROJECT_ID || 'gta6-shorts-ai',
      authUri: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUri: 'https://oauth2.googleapis.com/token',
    };
  }

  // Fallback to client_secret.json in workspace or parent directory
  const secretPaths = [
    path.resolve(process.cwd(), 'client_secret.json'),
    path.resolve(process.cwd(), '..', 'youtube-uploader', 'client_secret.json'),
    path.resolve('c:/Users/Gopala Krishna/OneDrive/Desktop/YB-STICKMAN/youtube-uploader/client_secret.json'),
  ];

  for (const sp of secretPaths) {
    if (fs.existsSync(sp)) {
      try {
        const raw = JSON.parse(fs.readFileSync(sp, 'utf8'));
        const cfg = raw.installed || raw.web || {};
        if (cfg.client_id && cfg.client_secret) {
          return {
            clientId: cfg.client_id,
            clientSecret: cfg.client_secret,
            redirectUri: envRedirectUri?.trim() || cfg.redirect_uris?.[0] || 'http://localhost:3000/api/youtube/callback',
            projectId: cfg.project_id || 'gta6-shorts-ai',
            authUri: cfg.auth_uri || 'https://accounts.google.com/o/oauth2/v2/auth',
            tokenUri: cfg.token_uri || 'https://oauth2.googleapis.com/token',
          };
        }
      } catch {}
    }
  }

  return {
    clientId: '',
    clientSecret: '',
    redirectUri: 'http://localhost:3000/api/youtube/callback',
    projectId: 'gta6-shorts-ai',
    authUri: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUri: 'https://oauth2.googleapis.com/token',
  };
}

export const youtubeOAuth = {
  /**
   * Generate official Google OAuth 2.0 authorization URL
   */
  generateAuthUrl(customRedirectUri?: string): { url: string; state: string } {
    const cfg = loadOAuthConfig();
    if (!cfg.clientId) {
      throw new Error('Google OAuth Client ID is not configured. Please set GOOGLE_CLIENT_ID or provide client_secret.json.');
    }

    const state = crypto.randomBytes(16).toString('hex');
    const redirectUri = customRedirectUri || cfg.redirectUri || 'http://localhost:3000/api/youtube/callback';

    const authUrl = new URL(cfg.authUri);
    authUrl.searchParams.set('client_id', cfg.clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', YOUTUBE_SCOPES.join(' '));
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('include_granted_scopes', 'true');
    authUrl.searchParams.set('state', state);

    return {
      url: authUrl.toString(),
      state,
    };
  },

  /**
   * Exchange authorization code for access & refresh tokens
   */
  async exchangeCode(code: string, redirectUri: string) {
    const cfg = loadOAuthConfig();
    if (!cfg.clientId || !cfg.clientSecret) {
      throw new Error('Google OAuth credentials missing.');
    }

    const body = new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });

    const res = await fetch(cfg.tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Token exchange failed: HTTP ${res.status} -> ${errText}`);
    }

    const data = await res.json();
    return {
      accessToken: data.access_token as string,
      refreshToken: data.refresh_token as string | undefined,
      tokenType: data.token_type || 'Bearer',
      expiresIn: (data.expires_in || 3600) as number,
      scope: (data.scope || '') as string,
    };
  },

  /**
   * Refresh expired access token using stored refresh token
   */
  async refreshAccessToken(refreshToken: string) {
    const cfg = loadOAuthConfig();
    if (!cfg.clientId || !cfg.clientSecret) {
      throw new Error('Google OAuth credentials missing.');
    }

    const body = new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    const res = await fetch(cfg.tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      let code = '';
      try { code = (await res.json()).error || ''; } catch {}
      if (code === 'invalid_grant' || code === 'unauthorized_client' || code === 'invalid_client') {
        throw new OAuthReauthRequiredError(
          `Google rejected the stored refresh token (${code}). Common causes: access revoked in the Google account, ` +
            `the OAuth consent screen is in "Testing" mode (Google expires refresh tokens after 7 days), ` +
            `or the client secret changed. Reconnect once; publish the consent screen to "In production" to stop recurring expiry.`
        );
      }
      throw new Error(`Token refresh temporarily failed: HTTP ${res.status}${code ? ` (${code})` : ''}`);
    }

    const data = await res.json();
    return {
      accessToken: data.access_token as string,
      refreshToken: (data.refresh_token as string | undefined) || undefined, // Google may rotate it
      expiresIn: (data.expires_in || 3600) as number,
      tokenType: data.token_type || 'Bearer',
      scope: data.scope as string | undefined,
    };
  },

  /**
   * Fetch authenticated YouTube channel details via YouTube Data API v3
   */
  async fetchChannel(accessToken: string): Promise<YouTubeChannelProfile> {
    const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&mine=true', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to retrieve YouTube channel: HTTP ${res.status} -> ${errText}`);
    }

    const data = await res.json();
    const item = data.items?.[0];
    if (!item) {
      throw new Error('No YouTube channel found on the authenticated Google account.');
    }

    // Optional userinfo lookup for email
    let email: string | null = null;
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (userRes.ok) {
        const u = await userRes.json();
        email = u.email || null;
      }
    } catch {}

    return {
      id: item.id,
      title: item.snippet?.title || 'YouTube Channel',
      customUrl: item.snippet?.customUrl || null,
      thumbnailUrl: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || null,
      subscribers: item.statistics?.subscriberCount ? Number(item.statistics.subscriberCount).toLocaleString() : 'Hidden',
      videos: item.statistics?.videoCount ? Number(item.statistics.videoCount).toLocaleString() : '0',
      email,
      canUpload: true,
    };
  },

  /**
   * Persist a fresh connection. Keeps the existing refresh token when Google does not return a new one
   * (it only does on first consent), and clears token-less YouTube placeholder rows that used to shadow it.
   */
  saveConnection(
    channel: YouTubeChannelProfile,
    tokens: { accessToken: string; refreshToken?: string; expiresIn: number; scope: string }
  ) {
    const accountId = `yt_${channel.id}`;
    const expiresAt = new Date(Date.now() + (tokens.expiresIn - 60) * 1000).toISOString();
    const previous = dbRepo.getOAuthToken(accountId) as any;

    dbRepo.saveConnectedAccount({
      id: accountId,
      userId: 'usr_creator_01',
      platform: 'youtube',
      accountName: channel.title,
      accountId: channel.id,
      profileImageUrl: channel.thumbnailUrl || undefined,
    });

    const refreshTokenEncrypted = tokens.refreshToken
      ? encryptToken(tokens.refreshToken)
      : previous?.refresh_token_encrypted || undefined;
    if (!refreshTokenEncrypted) {
      console.error(`[YouTubeOAuth] Google returned no refresh token for ${channel.id}; the connection will need renewing when the access token expires.`);
    }

    dbRepo.saveOAuthToken({
      id: `tok_${accountId}`,
      accountId,
      platform: 'youtube',
      accessTokenEncrypted: encryptToken(tokens.accessToken),
      refreshTokenEncrypted,
      tokenType: 'Bearer',
      scope: tokens.scope || previous?.scope || YOUTUBE_SCOPES.join(' '),
      expiresAt,
    });

    for (const a of dbRepo.listConnectedAccounts() as any[]) {
      if (a.platform === 'youtube' && a.id !== accountId && !dbRepo.getOAuthToken(a.id)) {
        dbRepo.deleteConnectedAccount(a.id);
      }
    }
    G.__ytChannelCache.set(accountId, { at: Date.now(), channel });
    console.log(`[YouTubeOAuth] Connected channel ${channel.id}; access token valid until ${expiresAt}.`);
  },

  /** A valid access token for the connected channel, refreshing (once, de-duplicated) when near expiry. */
  async getValidAccessToken(opts: { minValidityMs?: number } = {}): Promise<string> {
    const conn = resolveYouTubeConnection();
    if (!conn) throw new OAuthReauthRequiredError('No YouTube channel connected.');
    const { account, token } = conn;
    const minValidity = opts.minValidityMs ?? 2 * 60 * 1000;

    const current = decryptToken(token.access_token_encrypted);
    if (current && Date.now() < new Date(token.expires_at).getTime() - minValidity) return current;

    const inflight = G.__ytRefreshInFlight.get(account.id);
    if (inflight) return inflight;

    const p = (async () => {
      const refreshToken = decryptToken(token.refresh_token_encrypted || '');
      if (!refreshToken) throw new OAuthReauthRequiredError('Access token expired and no refresh token is stored. Reconnect once.');
      const refreshed = await this.refreshAccessToken(refreshToken);
      dbRepo.saveOAuthToken({
        id: token.id,
        accountId: account.id,
        platform: 'youtube',
        accessTokenEncrypted: encryptToken(refreshed.accessToken),
        refreshTokenEncrypted: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : token.refresh_token_encrypted,
        tokenType: refreshed.tokenType,
        scope: refreshed.scope || token.scope,
        expiresAt: new Date(Date.now() + (refreshed.expiresIn - 60) * 1000).toISOString(),
      });
      console.log(`[YouTubeOAuth] Refreshed access token for ${account.account_id}.`);
      return refreshed.accessToken;
    })();
    G.__ytRefreshInFlight.set(account.id, p);
    try {
      return await p;
    } finally {
      G.__ytRefreshInFlight.delete(account.id);
    }
  },

  /** Called by the background worker so tokens are renewed before anyone needs them. Never throws. */
  async refreshIfExpiringSoon(): Promise<void> {
    if (!resolveYouTubeConnection()) return;
    try {
      await this.getValidAccessToken({ minValidityMs: 15 * 60 * 1000 });
      G.__ytLastRefreshError = null;
    } catch (err: any) {
      if (G.__ytLastRefreshError !== err.message) console.error(`[YouTubeOAuth] Background token refresh failed: ${err.message}`);
      G.__ytLastRefreshError = err.message;
    }
  },

  /** The connected channel's id, or null. */
  connectedChannelId(): string | null {
    return resolveYouTubeConnection()?.account.account_id || null;
  },

  /**
   * Real connection status. Only a Google rejection (or missing/undecryptable credentials) reports the channel as
   * disconnected; network blips and quota errors keep it connected and surface a warning instead. Channel details
   * are cached for 10 minutes so status polling does not burn YouTube Data API quota.
   */
  async getStatusReport(): Promise<YouTubeStatusReport> {
    const now = new Date().toISOString();
    const conn = resolveYouTubeConnection();
    if (!conn) {
      return { state: 'NOT_CONNECTED', connected: false, channel: null, scopes: [], lastChecked: now, canUpload: false, canSchedule: false };
    }
    const { account, token } = conn;
    const scopes = String(token.scope || '').split(' ').map((s) => s.trim()).filter(Boolean);
    const stored: YouTubeChannelProfile = {
      id: account.account_id,
      title: account.account_name,
      thumbnailUrl: account.profile_image_url,
      connectedAt: account.created_at,
      tokenExpiresAt: token.expires_at,
    };

    if (!scopes.some((s) => s.includes('youtube.upload'))) {
      return {
        state: 'PERMISSION_MISSING', connected: false, channel: { ...stored, canUpload: false }, scopes, lastChecked: now,
        error: 'The upload permission was not granted. Reconnect and allow YouTube upload access.', canUpload: false, canSchedule: false,
      };
    }

    try {
      const accessToken = await this.getValidAccessToken();
      let cached = G.__ytChannelCache.get(account.id);
      if (!cached || Date.now() - cached.at > CHANNEL_CACHE_MS) {
        try {
          cached = { at: Date.now(), channel: await this.fetchChannel(accessToken) };
          G.__ytChannelCache.set(account.id, cached);
        } catch (err: any) {
          console.error(`[YouTubeOAuth] Channel lookup failed (credentials still valid): ${String(err.message).slice(0, 200)}`);
          cached = { at: 0, channel: stored };
        }
      }
      const fresh = dbRepo.getOAuthToken(account.id) as any;
      return {
        state: 'CONNECTED', connected: true,
        channel: { ...stored, ...cached.channel, connectedAt: account.created_at, tokenExpiresAt: fresh?.expires_at, canUpload: true },
        scopes, lastChecked: now, canUpload: true, canSchedule: true,
      };
    } catch (err: any) {
      if (err instanceof OAuthReauthRequiredError) {
        console.error(`[YouTubeOAuth] Re-authorisation required for ${account.account_id}: ${err.message}`);
        return {
          state: 'REAUTH_REQUIRED', connected: false, channel: { ...stored, canUpload: false }, scopes, lastChecked: now,
          error: err.message, canUpload: false, canSchedule: false,
        };
      }
      console.error(`[YouTubeOAuth] Transient status check failure: ${err.message}`);
      return {
        state: 'CONNECTED', connected: true, channel: { ...stored, canUpload: true }, scopes, lastChecked: now,
        error: `Could not reach Google just now (${err.message}). The connection is kept and will retry automatically.`,
        canUpload: true, canSchedule: true,
      };
    }
  },

  /** Explicit user action only: revoke at Google and delete the stored credentials. */
  async disconnect(): Promise<{ success: boolean }> {
    const conn = resolveYouTubeConnection();
    for (const a of dbRepo.listConnectedAccounts() as any[]) {
      if (a.platform !== 'youtube') continue;
      if (conn && a.id === conn.account.id) {
        try {
          const t = decryptToken(conn.token.refresh_token_encrypted || '') || decryptToken(conn.token.access_token_encrypted);
          if (t) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t)}`, { method: 'POST', signal: AbortSignal.timeout(10000) });
        } catch (err: any) {
          console.error(`[YouTubeOAuth] Revoke call failed (credentials deleted locally anyway): ${err.message}`);
        }
      }
      dbRepo.deleteConnectedAccount(a.id);
      G.__ytChannelCache.delete(a.id);
    }
    return { success: true };
  },
};

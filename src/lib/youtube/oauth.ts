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

// AES-256-GCM Token Encryption at Rest
function getEncryptionKey(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY || 'gta6_shorts_ai_production_oauth_encryption_key_2026';
  return crypto.createHash('sha256').update(secret).digest();
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
  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) return encryptedData; // Fallback if plain
    const [ivHex, authTagHex, encHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const enc = Buffer.from(encHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(enc), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    console.warn('[YouTubeOAuth] Decryption fallback:', err);
    return encryptedData;
  }
}

export function tryReadUploaderTokens(): any | null {
  const candidates = [
    path.resolve(process.cwd(), '..', 'youtube-uploader', '.tokens.json'),
    path.resolve(process.cwd(), 'youtube-uploader', '.tokens.json'),
    path.resolve('c:/Users/Gopala Krishna/OneDrive/Desktop/YB-STICKMAN/youtube-uploader/.tokens.json'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        return JSON.parse(fs.readFileSync(c, 'utf8'));
      } catch {}
    }
  }
  return null;
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
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Token refresh failed: HTTP ${res.status} -> ${errText}`);
    }

    const data = await res.json();
    return {
      accessToken: data.access_token as string,
      expiresIn: (data.expires_in || 3600) as number,
      tokenType: data.token_type || 'Bearer',
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
   * Save or update YouTube connection in database with encryption
   */
  saveConnection(
    channel: YouTubeChannelProfile,
    tokens: {
      accessToken: string;
      refreshToken?: string;
      expiresIn: number;
      scope: string;
    }
  ) {
    const accountId = `yt_${channel.id}`;
    const expiresAt = new Date(Date.now() + (tokens.expiresIn - 60) * 1000).toISOString();

    // 1. Save connected social account record
    dbRepo.saveConnectedAccount({
      id: accountId,
      userId: 'usr_creator_01',
      platform: 'youtube',
      accountName: channel.title,
      accountId: channel.id,
      profileImageUrl: channel.thumbnailUrl || undefined,
    });

    // 2. Encrypt tokens at rest and persist
    dbRepo.saveOAuthToken({
      id: `tok_${accountId}`,
      accountId,
      platform: 'youtube',
      accessTokenEncrypted: encryptToken(tokens.accessToken),
      refreshTokenEncrypted: tokens.refreshToken ? encryptToken(tokens.refreshToken) : undefined,
      tokenType: 'Bearer',
      scope: tokens.scope,
      expiresAt,
    });

    console.log(`[YouTubeOAuth] ✓ Secured YouTube connection for channel: "${channel.title}" (${channel.id}). Token expires at ${expiresAt}`);
  },

  /**
   * Retrieve a guaranteed-valid access token, automatically refreshing if expired
   */
  async getValidAccessToken(): Promise<string> {
    const accounts = dbRepo.listConnectedAccounts() as any[];
    let ytAccount = accounts.find((a: any) => a.platform === 'youtube');
    let tokenRecord = ytAccount ? (dbRepo.getOAuthToken(ytAccount.id) as any) : null;

    if (!tokenRecord) {
      const uploaderTokens = tryReadUploaderTokens();
      if (uploaderTokens?.access_token) {
        const accountId = ytAccount?.id || 'acc_yt_creator_test';
        ytAccount = dbRepo.saveConnectedAccount({
          id: accountId,
          userId: 'usr_creator_01',
          platform: 'youtube',
          accountName: 'Connected YouTube Channel',
          accountId: 'yt_creator_chan_01',
        });
        dbRepo.saveOAuthToken({
          id: `tok_${accountId}`,
          accountId,
          platform: 'youtube',
          accessTokenEncrypted: encryptToken(uploaderTokens.access_token),
          refreshTokenEncrypted: uploaderTokens.refresh_token ? encryptToken(uploaderTokens.refresh_token) : undefined,
          tokenType: 'Bearer',
          scope: uploaderTokens.scope || YOUTUBE_SCOPES.join(' '),
          expiresAt: uploaderTokens.expires_at ? new Date(uploaderTokens.expires_at).toISOString() : new Date(Date.now() + 3600000).toISOString(),
        });
        tokenRecord = dbRepo.getOAuthToken(accountId);
      }
    }

    if (!ytAccount) {
      throw new Error('No YouTube channel connected. Please connect your YouTube channel first.');
    }

    if (!tokenRecord) {
      throw new Error('OAuth token record missing for connected YouTube channel.');
    }

    const currentAccess = decryptToken(tokenRecord.access_token_encrypted);
    const expiresAtMs = new Date(tokenRecord.expires_at).getTime();
    const isStillValid = Date.now() < expiresAtMs - 120000; // 2 minute safety buffer

    if (currentAccess && isStillValid) {
      return currentAccess;
    }

    // Attempt token refresh
    const refreshToken = decryptToken(tokenRecord.refresh_token_encrypted);
    if (!refreshToken) {
      throw new Error('Access token expired and no refresh token available. Re-authentication required.');
    }

    console.log('[YouTubeOAuth] Access token expired or near expiry. Refreshing with Google OAuth...');
    const refreshed = await this.refreshAccessToken(refreshToken);

    const newExpiresAt = new Date(Date.now() + (refreshed.expiresIn - 60) * 1000).toISOString();
    dbRepo.saveOAuthToken({
      id: tokenRecord.id,
      accountId: ytAccount.id,
      platform: 'youtube',
      accessTokenEncrypted: encryptToken(refreshed.accessToken),
      refreshTokenEncrypted: tokenRecord.refresh_token_encrypted, // keep existing encrypted refresh token
      tokenType: refreshed.tokenType,
      scope: tokenRecord.scope,
      expiresAt: newExpiresAt,
    });

    return refreshed.accessToken;
  },

  /**
   * Health-check and return connection report with official 9 states
   */
  async getStatusReport(): Promise<YouTubeStatusReport> {
    const now = new Date().toISOString();
    const accounts = dbRepo.listConnectedAccounts() as any[];
    let ytAccount = accounts.find((a: any) => a.platform === 'youtube');
    let tokenRecord = ytAccount ? (dbRepo.getOAuthToken(ytAccount.id) as any) : null;

    // Check youtube-uploader/.tokens.json fallback to sync existing desktop tokens
    if (!tokenRecord) {
      const uploaderTokens = tryReadUploaderTokens();
      if (uploaderTokens?.access_token) {
        const accountId = ytAccount?.id || 'acc_yt_creator_test';
        ytAccount = dbRepo.saveConnectedAccount({
          id: accountId,
          userId: 'usr_creator_01',
          platform: 'youtube',
          accountName: 'Connected YouTube Channel',
          accountId: 'yt_creator_chan_01',
        });
        dbRepo.saveOAuthToken({
          id: `tok_${accountId}`,
          accountId,
          platform: 'youtube',
          accessTokenEncrypted: encryptToken(uploaderTokens.access_token),
          refreshTokenEncrypted: uploaderTokens.refresh_token ? encryptToken(uploaderTokens.refresh_token) : undefined,
          tokenType: 'Bearer',
          scope: uploaderTokens.scope || YOUTUBE_SCOPES.join(' '),
          expiresAt: uploaderTokens.expires_at ? new Date(uploaderTokens.expires_at).toISOString() : new Date(Date.now() + 3600000).toISOString(),
        });
        tokenRecord = dbRepo.getOAuthToken(accountId);
      }
    }

    if (!ytAccount || !tokenRecord) {
      return {
        state: 'NOT_CONNECTED',
        connected: false,
        channel: null,
        scopes: [],
        lastChecked: now,
        canUpload: false,
        canSchedule: false,
      };
    }

    const scopes = (tokenRecord.scope || '')
      .split(' ')
      .map((s: string) => s.trim())
      .filter(Boolean);

    const hasUploadScope = scopes.some((s: string) => s.includes('youtube.upload') || s.includes('youtube'));
    if (!hasUploadScope) {
      return {
        state: 'PERMISSION_MISSING',
        connected: false,
        channel: {
          id: ytAccount.account_id,
          title: ytAccount.account_name,
          thumbnailUrl: ytAccount.profile_image_url,
          canUpload: false,
        },
        scopes,
        lastChecked: now,
        error: 'Missing required upload permission (https://www.googleapis.com/auth/youtube.upload). Reconnect with full permissions.',
        canUpload: false,
        canSchedule: false,
      };
    }

    try {
      const accessToken = await this.getValidAccessToken();
      const channel = await this.fetchChannel(accessToken);

      return {
        state: 'CONNECTED',
        connected: true,
        channel: {
          ...channel,
          connectedAt: ytAccount.created_at,
          tokenExpiresAt: tokenRecord.expires_at,
          canUpload: true,
        },
        scopes,
        lastChecked: now,
        canUpload: true,
        canSchedule: true,
      };
    } catch (err: any) {
      const errMsg = err.message || '';
      if (errMsg.includes('expired') || errMsg.includes('invalid_grant')) {
        return {
          state: 'TOKEN_EXPIRED',
          connected: false,
          channel: {
            id: ytAccount.account_id,
            title: ytAccount.account_name,
            thumbnailUrl: ytAccount.profile_image_url,
            canUpload: false,
          },
          scopes,
          lastChecked: now,
          error: 'YouTube authorization expired. Please click Reconnect YouTube to renew access.',
          canUpload: false,
          canSchedule: false,
        };
      }

      return {
        state: 'CONNECTION_ERROR',
        connected: false,
        channel: {
          id: ytAccount.account_id,
          title: ytAccount.account_name,
          thumbnailUrl: ytAccount.profile_image_url,
          canUpload: false,
        },
        scopes,
        lastChecked: now,
        error: `YouTube verification check failed: ${errMsg}`,
        canUpload: false,
        canSchedule: false,
      };
    }
  },

  /**
   * Disconnect YouTube channel and revoke tokens
   */
  async disconnect(): Promise<{ success: boolean }> {
    const accounts = dbRepo.listConnectedAccounts() as any[];
    const ytAccount = accounts.find((a: any) => a.platform === 'youtube');
    if (ytAccount) {
      const tokenRecord = dbRepo.getOAuthToken(ytAccount.id) as any;
      if (tokenRecord) {
        try {
          const accessToken = decryptToken(tokenRecord.access_token_encrypted);
          if (accessToken) {
            await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            });
          }
        } catch {}
      }
      dbRepo.deleteConnectedAccount(ytAccount.id);
    }
    return { success: true };
  },
};

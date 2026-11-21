import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';

export interface YouTubeChannelInfo {
  id: string;
  title: string;
  customUrl?: string | null;
  thumbnailUrl?: string | null;
  subscribers?: string | null;
  videos?: string | null;
  accountEmail?: string | null;
}

export interface YouTubeAccountStatus {
  connected: boolean;
  status: 'connected' | 'expired' | 'disconnected';
  needsReconnect: boolean;
  channel: YouTubeChannelInfo | null;
  scopes: string[];
  clientId?: string;
  projectId?: string;
  tokenExpiresAt?: string | null;
  error?: string | null;
}

export interface YouTubePublishOptions {
  filePath: string;
  title: string;
  description: string;
  tags?: string[];
  privacyStatus?: 'public' | 'unlisted' | 'private';
  publishAt?: string;
}

export interface YouTubePublishResponse {
  success: boolean;
  platform: 'youtube_shorts';
  platformPostId?: string;
  publishedUrl?: string;
  studioUrl?: string;
  error?: string;
  details?: any;
}

function resolveUploaderDir(): string {
  const candidates = [
    path.resolve(process.cwd(), '..', 'youtube-uploader'),
    path.resolve(process.cwd(), 'youtube-uploader'),
    path.resolve('c:/Users/Gopala Krishna/OneDrive/Desktop/YB-STICKMAN/youtube-uploader'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

export const youtubeClient = {
  /**
   * Inspect existing YouTube connection in youtube-uploader/.tokens.json
   * Never creates duplicate connections; reuses existing authenticated YouTube account.
   */
  async getStatus(): Promise<YouTubeAccountStatus> {
    const uploaderDir = resolveUploaderDir();
    const clientSecretPath = path.join(uploaderDir, 'client_secret.json');
    const tokensPath = path.join(uploaderDir, '.tokens.json');

    const clientExists = fs.existsSync(clientSecretPath);
    const tokensExist = fs.existsSync(tokensPath);

    if (!clientExists) {
      return {
        connected: false,
        status: 'disconnected',
        needsReconnect: false,
        channel: null,
        scopes: [],
        error: `OAuth client file missing at ${clientSecretPath}`,
      };
    }

    let clientConfig: any = {};
    try {
      const raw = JSON.parse(fs.readFileSync(clientSecretPath, 'utf8'));
      clientConfig = raw.installed || raw.web || {};
    } catch (err: any) {
      return {
        connected: false,
        status: 'disconnected',
        needsReconnect: false,
        channel: null,
        scopes: [],
        error: `Failed to parse client_secret.json: ${err.message}`,
      };
    }

    if (!tokensExist) {
      return {
        connected: false,
        status: 'disconnected',
        needsReconnect: true,
        channel: null,
        scopes: [],
        clientId: clientConfig.client_id,
        projectId: clientConfig.project_id || 'mahashivalinga',
        error: 'No active OAuth tokens found. Please connect your YouTube account.',
      };
    }

    let savedTokens: any = {};
    try {
      savedTokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
    } catch {
      return {
        connected: false,
        status: 'disconnected',
        needsReconnect: true,
        channel: null,
        scopes: [],
        error: 'Corrupted .tokens.json file.',
      };
    }

    const scopesList = (savedTokens.scope || '')
      .split(' ')
      .map((s: string) => s.trim())
      .filter(Boolean);

    const tokenExpiresAt = savedTokens.expires_at
      ? new Date(savedTokens.expires_at).toISOString()
      : null;

    // Test token and channel using node process
    const statusScript = path.join(uploaderDir, 'status.mjs');
    try {
      const proc = spawnSync('node', [statusScript], {
        cwd: uploaderDir,
        encoding: 'utf8',
        timeout: 10000,
      });

      if (proc.status === 0 && proc.stdout) {
        const parsed = JSON.parse(proc.stdout);
        if (parsed.ready && parsed.channel) {
          const ch = parsed.channel;
          return {
            connected: true,
            status: 'connected',
            needsReconnect: false,
            channel: {
              id: ch.id,
              title: ch.title,
              customUrl: ch.customUrl,
              thumbnailUrl: ch.thumbnailUrl || null,
              subscribers: ch.subscribers,
              videos: ch.videos,
              accountEmail: clientConfig.project_id
                ? `${clientConfig.project_id} (Google Cloud Project)`
                : undefined,
            },
            scopes: scopesList,
            clientId: clientConfig.client_id,
            projectId: clientConfig.project_id || 'mahashivalinga',
            tokenExpiresAt,
          };
        }
      }

      const errMsg = proc.stderr || 'Token expired or revoked';
      console.warn('[YouTubeClient] Token verification notice:', errMsg.trim());

      return {
        connected: true,
        status: 'expired',
        needsReconnect: true,
        channel: {
          id: 'connected_yt_channel',
          title: 'Connected YouTube Channel',
          customUrl: '@ConnectedCreator',
          subscribers: null,
          accountEmail: clientConfig.project_id
            ? `Google Project: ${clientConfig.project_id}`
            : 'Authenticated User',
        },
        scopes: scopesList.length > 0 ? scopesList : ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],
        clientId: clientConfig.client_id,
        projectId: clientConfig.project_id || 'mahashivalinga',
        tokenExpiresAt,
        error: `OAuth session expired (${errMsg.trim()}). Click 'Reconnect YouTube' to authorize via Google Sign-In.`,
      };
    } catch (err: any) {
      return {
        connected: true,
        status: 'expired',
        needsReconnect: true,
        channel: null,
        scopes: scopesList,
        clientId: clientConfig.client_id,
        projectId: clientConfig.project_id || 'mahashivalinga',
        tokenExpiresAt,
        error: err.message,
      };
    }
  },

  /**
   * Reconnect existing YouTube account using OAuth PKCE loopback
   * Launches auth.mjs in background and opens Google Sign-In in browser
   */
  async reconnect(): Promise<{ success: boolean; channel?: YouTubeChannelInfo; error?: string }> {
    const uploaderDir = resolveUploaderDir();
    const authScript = path.join(uploaderDir, 'auth.mjs');

    return new Promise((resolve) => {
      console.log('[YouTubeClient] Launching Google OAuth sign-in flow in default browser...');
      const proc = spawn('node', [authScript], {
        cwd: uploaderDir,
        detached: true,
        stdio: 'pipe',
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => {
        stdout += d.toString();
      });

      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      // 3 minute timeout for browser authentication
      const timer = setTimeout(() => {
        try {
          proc.kill();
        } catch {}
        resolve({
          success: false,
          error: 'Authentication timed out. Please complete Google Sign-In in browser and retry.',
        });
      }, 180000);

      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          try {
            const data = JSON.parse(stdout.trim());
            console.log(`[YouTubeClient] ✓ Successfully reconnected channel:`, data.channel);
            resolve({
              success: true,
              channel: data.channel,
            });
          } catch {
            resolve({ success: true });
          }
        } else {
          resolve({
            success: false,
            error: stderr || stdout || `Process exited with code ${code}`,
          });
        }
      });
    });
  },

  /**
   * Disconnect YouTube account safely
   */
  async disconnect(): Promise<{ success: boolean }> {
    const uploaderDir = resolveUploaderDir();
    const tokensPath = path.join(uploaderDir, '.tokens.json');
    if (fs.existsSync(tokensPath)) {
      const backupPath = path.join(uploaderDir, `.tokens_backup_${Date.now()}.json`);
      fs.renameSync(tokensPath, backupPath);
      console.log(`[YouTubeClient] Archived tokens to: ${backupPath}`);
    }
    return { success: true };
  },

  /**
   * Publish video to YouTube Shorts using official YouTube Data API v3 Resumable Upload
   */
  async uploadShort(options: YouTubePublishOptions): Promise<YouTubePublishResponse> {
    const { filePath, title, description, tags = [], privacyStatus = 'public', publishAt } = options;

    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        platform: 'youtube_shorts',
        error: `File not found on disk: ${filePath}`,
      };
    }

    const uploaderDir = resolveUploaderDir();
    const uploadScript = path.join(uploaderDir, 'upload.mjs');

    const args = [
      uploadScript,
      '--file',
      filePath,
      '--title',
      title.slice(0, 100),
      '--description',
      description,
      '--tags',
      tags.join(','),
      '--privacy',
      publishAt ? 'private' : privacyStatus,
    ];

    if (publishAt) {
      args.push('--publish-at', publishAt);
    }

    console.log(`[YouTubeClient] Executing resumable upload via upload.mjs...`);
    const proc = spawnSync('node', args, {
      cwd: uploaderDir,
      encoding: 'utf8',
      timeout: 300000, // 5 min timeout for video upload
    });

    if (proc.status === 0 && proc.stdout) {
      try {
        const out = JSON.parse(proc.stdout.trim());
        return {
          success: true,
          platform: 'youtube_shorts',
          platformPostId: out.video_id,
          publishedUrl: out.watch_url,
          studioUrl: out.studio_url,
          details: out,
        };
      } catch {
        return {
          success: true,
          platform: 'youtube_shorts',
          details: proc.stdout,
        };
      }
    }

    const errMsg = proc.stderr || proc.stdout || 'Upload failed';
    throw new Error(`YouTube upload failed: ${errMsg.trim()}`);
  },
};

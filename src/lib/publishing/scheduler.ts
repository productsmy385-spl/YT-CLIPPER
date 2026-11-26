import { dbRepo } from '../../db/repository.ts';
import { youtubeService } from './youtube.ts';
import { instagramService } from './instagram.ts';
import { tiktokService } from './tiktok.ts';

let isRunning = false;
let intervalTimer: NodeJS.Timeout | null = null;

export const publishingScheduler = {
  // Execute a single post immediately or on schedule
  async publishPost(postId: string) {
    const post = dbRepo.getScheduledPostById(postId) as any;
    if (!post) {
      throw new Error(`Scheduled post not found: ${postId}`);
    }

    if (post.status === 'PUBLISHED') {
      console.log(`[Scheduler] Post ${postId} is already published. Skipping duplicate execution.`);
      return { success: true, message: 'Already published', publishedUrl: post.published_url };
    }

    console.log(`\n--- 🚀 EXECUTING PUBLISHING FOR POST: ${postId} (${post.platform}) ---`);
    console.log(`Title: ${post.title}`);
    console.log(`Target Platform: ${post.platform}`);

    // Pre-Publishing Copyright & Licensing Verification Gate
    if (post.project_id) {
      try {
        const project = dbRepo.getProject(post.project_id) as any;
        const sourceVideo = dbRepo.getSourceVideoByProject(post.project_id) as any;
        if (sourceVideo && sourceVideo.copyright_declared === 0 && !sourceVideo.origin_source?.includes('authorized')) {
          const blockingReason = 'Original creator permission not verified. Automated publishing blocked until creator licensing is confirmed.';
          console.warn(`[Scheduler] ⚠️ BLOCKED post ${postId}: ${blockingReason}`);
          dbRepo.updateScheduledPostStatus(postId, 'FAILED', { lastError: blockingReason });
          return {
            success: false,
            platform: post.platform,
            error: blockingReason,
          };
        }
      } catch (err) {
        // Non-blocking if table query fails
      }
    }

    // Atomically transition status to PROCESSING to prevent duplicate concurrent runs
    dbRepo.updateScheduledPostStatus(postId, 'PROCESSING');

    let result;
    try {
      if (post.platform === 'youtube_shorts') {
        result = await youtubeService.publish({
          filePath: post.file_path,
          title: post.title,
          description: post.description || '',
          tags: (post.tags || '').split(',').map((t: string) => t.trim()),
          privacyStatus: 'public',
        });
      } else if (post.platform === 'instagram_reels') {
        result = await instagramService.publish({
          filePath: post.file_path,
          caption: `${post.title}\n\n${post.description || ''}`,
        });
      } else if (post.platform === 'tiktok') {
        result = await tiktokService.publish({
          filePath: post.file_path,
          title: post.title,
        });
      } else {
        throw new Error(`Unsupported publishing platform: ${post.platform}`);
      }

      if (result.success) {
        console.log(`✓ Published successfully! Post ID: ${result.platformPostId} | URL: ${result.publishedUrl}`);
        dbRepo.updateScheduledPostStatus(postId, 'PUBLISHED', {
          platformPostId: result.platformPostId,
          publishedUrl: result.publishedUrl,
        });

        dbRepo.logPublishingAttempt({
          id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          scheduledPostId: postId,
          attemptNumber: (post.retry_count || 0) + 1,
          responsePayload: JSON.stringify(result.details || {}),
        });

        return result;
      } else {
        throw new Error(result.error || 'Publishing service returned failure');
      }
    } catch (err: any) {
      console.error(`❌ Publishing failed for post ${postId}:`, err.message);
      const newRetryCount = (post.retry_count || 0) + 1;
      const isFatal = newRetryCount >= 3;

      dbRepo.incrementScheduledPostRetry(postId, err.message);
      if (isFatal) {
        dbRepo.updateScheduledPostStatus(postId, 'FAILED', { lastError: err.message });
      }

      dbRepo.logPublishingAttempt({
        id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        scheduledPostId: postId,
        attemptNumber: newRetryCount,
        errorMessage: err.message,
      });

      return {
        success: false,
        platform: post.platform,
        error: err.message,
      };
    }
  },

  // Check and process due scheduled posts
  async runDueJobs() {
    if (isRunning) return;
    isRunning = true;

    try {
      const duePosts = dbRepo.getDueScheduledPosts() as any[];
      if (duePosts.length > 0) {
        console.log(`[Scheduler] Found ${duePosts.length} posts due for publishing...`);
        for (const post of duePosts) {
          await this.publishPost(post.id);
        }
      }
    } catch (err) {
      console.error('[Scheduler] Error checking due jobs:', err);
    } finally {
      isRunning = false;
    }
  },

  // Start persistent background polling daemon
  startDaemon(intervalMs = 30000) {
    if (intervalTimer) return;
    console.log(`[Scheduler] ⏰ Starting persistent publishing worker daemon (interval: ${intervalMs / 1000}s)...`);
    this.runDueJobs().catch(console.error);

    intervalTimer = setInterval(() => {
      this.runDueJobs().catch(console.error);
    }, intervalMs);
  },

  stopDaemon() {
    if (intervalTimer) {
      clearInterval(intervalTimer);
      intervalTimer = null;
      console.log('[Scheduler] Publishing worker daemon stopped.');
    }
  },
};

// Started by src/instrumentation-node.ts when the server boots (never on import: importing it during
// `next build` used to publish due posts from the build machine).

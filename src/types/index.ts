export type AgentStatus = 'idle' | 'running' | 'completed' | 'failed';

export type HighlightCategory =
  | 'funny_moment'
  | 'funny_gameplay'
  | 'unexpected_event'
  | 'unexpected_moments'
  | 'crazy_gameplay'
  | 'epic_stunts'
  | 'epic_action'
  | 'explosions_action'
  | 'cinematic_moment'
  | 'cinematic_gameplay'
  | 'fail_moment'
  | 'character_fails'
  | 'npc_reaction'
  | 'npc_reactions'
  | 'police_chase'
  | 'police_chases'
  | 'driving_racing'
  | 'crazy_driving'
  | 'dialogue_exchange'
  | 'conversations'
  | 'streamer_reactions'
  | 'plot_moments';

export interface Scene {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
  avgMotionScore: number;
  visualSummary: string;
  keyframePath?: string;
}

export interface SpeechSegment {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  speaker?: string;
  confidence: number;
  words?: Array<{
    word: string;
    start: number;
    end: number;
    confidence?: number;
  }>;
}

export interface AudioPeak {
  timestamp: number;
  volumeRms: number;
  energyLevel: 'low' | 'medium' | 'high' | 'peak';
}

export interface VideoAnalysisResult {
  fps: number;
  duration: number;
  width: number;
  height: number;
  codec: string;
  scenes: Scene[];
  speechSegments: SpeechSegment[];
  audioPeaks: AudioPeak[];
  gameplayContext: string;
}

export interface DetectedHighlight {
  id: string;
  projectId: string;
  sourceVideoId?: string;
  category: HighlightCategory;
  categoryLabel: string;
  entertainmentScore: number; // 1 - 100
  startTime: number;
  endTime: number;
  duration: number;
  hookStrength: number; // 1 - 100
  hookReason: string;
  peakEvent: string;
  suggestedMemeMood: 'laugh' | 'shock' | 'fail' | 'rage' | 'triumph' | 'none';
  suggestedMusicGenre: 'phonk' | 'action' | 'comedy' | 'suspense' | 'synthwave' | 'chill';
  selectedForExport: boolean;
}

export interface MemeAsset {
  id: string;
  name: string;
  emotion: 'laugh' | 'shock' | 'fail' | 'rage' | 'triumph';
  filePath: string;
  thumbnailPath?: string;
  duration: number;
  overlayType: 'pip_corner' | 'fullscreen_flash' | 'reaction_cutaway' | 'side_split';
  licenseStatus: 'verified_cc0' | 'licensed_partner' | 'public_domain';
}

export interface MusicAsset {
  id: string;
  title: string;
  genre: 'phonk' | 'action' | 'comedy' | 'suspense' | 'synthwave' | 'chill';
  bpm: number;
  energy: 'low' | 'medium' | 'high' | 'extreme';
  filePath: string;
  duration: number;
  licenseDetails: string;
}

export interface SoundEffectAsset {
  id: string;
  name: string;
  category: 'impact' | 'punch' | 'whoosh' | 'record_scratch' | 'boing' | 'laugh' | 'horn';
  filePath: string;
  duration: number;
  defaultVolume: number;
}

export interface ClipEditingConfig {
  clipId: string;
  cropMode: 'center_action' | 'dynamic_tracking' | 'split_cam_gameplay';
  cropX: number; // 0.0 to 1.0
  cropY: number;
  zoomScale: number;
  targetAspectRatio: '9:16';
  targetWidth: 1080;
  targetHeight: 1920;
  memeInserts: Array<{
    memeId: string;
    timestamp: number;
    duration: number;
    position: 'top_right' | 'bottom_right' | 'center' | 'pip';
    scale: number;
  }>;
  selectedMusicId?: string;
  musicDuckingDb: number;
  musicVolume: number;
  sfxEvents: Array<{
    sfxId: string;
    timestamp: number;
    volume: number;
  }>;
  subtitleStyle: 'vice_neon' | 'beast_yellow' | 'karaoke_bounce' | 'minimal_white';
}

export interface SubtitleToken {
  word: string;
  start: number;
  end: number;
  highlighted: boolean;
}

export interface CopyrightComplianceReport {
  projectId: string;
  clipId?: string;
  score: number; // 0 - 100
  passed: boolean;
  gameplayAuthorized: boolean;
  sourceAttribution: string;
  musicLicenseValid: boolean;
  musicAssetAttribution?: string;
  memesAuthorized: boolean;
  problematicItems: string[];
  safeForPublishing: boolean;
  legalNotice: string;
}

export interface QualityAssuranceReport {
  clipId: string;
  qaScore: number; // 0 - 100
  passed: boolean;
  resolutionCheck: boolean;
  aspectRatioCheck: boolean;
  audioClippingDetected: boolean;
  blackFramesDetected: boolean;
  subtitleSyncOffsetMs: number;
  openingHookGrade: 'A+' | 'A' | 'B' | 'C' | 'Fail';
  recommendations: string[];
}

export interface AgentExecutionLog {
  id: string;
  projectId?: string;
  agentId: string;
  agentName: string;
  stage: string;
  status: AgentStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  message: string;
  inputSummary?: string;
  outputSummary?: string;
  error?: string;
}

export interface ExportPreset {
  platform: 'youtube_shorts' | 'instagram_reels' | 'tiktok';
  maxDuration: number;
  resolution: string;
  fps: number;
  titleFormat: string;
  hashtags: string[];
}

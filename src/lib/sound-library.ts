import fs from 'node:fs';
import path from 'node:path';
import { APP_ROOT, PUBLIC_DIR } from './app-paths.ts';

export interface MemeSoundAsset {
  id: string;
  name: string;
  category:
    | 'laughing'
    | 'heavy_laughter'
    | 'sad_violin'
    | 'bruh'
    | 'shock'
    | 'suspense'
    | 'dramatic'
    | 'record_scratch'
    | 'cartoon'
    | 'punch'
    | 'fail'
    | 'victory'
    | 'surprise'
    | 'funny_reaction';
  filename: string;
  filePath: string;
  webPath: string;
  duration: number;
  defaultVolume: number;
  tags: string[];
}

class ExistingSoundLibrary {
  private library: MemeSoundAsset[] = [];
  private isLoaded = false;

  constructor() {
    this.loadSoundLibrary();
  }

  /**
   * Scan and index all existing meme sound files from project folders
   */
  public loadSoundLibrary(): MemeSoundAsset[] {
    if (this.isLoaded && this.library.length > 0) {
      return this.library;
    }

    const soundDirs = [
      path.resolve(PUBLIC_DIR, 'assets', 'sfx', 'gaming_memes'),
      path.resolve(PUBLIC_DIR, 'assets', 'sfx'),
      path.resolve(APP_ROOT, '..', 'sounds', 'gaming_memes'),
      path.resolve(APP_ROOT, '..', 'sounds', 'trending_memes'),
    ];

    const catalogPath = path.resolve(APP_ROOT, '..', 'sounds', 'sounds_catalog.json');
    let precomputedCatalog: any[] = [];
    if (fs.existsSync(catalogPath)) {
      try {
        precomputedCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      } catch {
        precomputedCatalog = [];
      }
    }

    const catalogMap = new Map<string, any>();
    for (const item of precomputedCatalog) {
      if (item.filename) catalogMap.set(item.filename.toLowerCase(), item);
    }

    const seenFiles = new Set<string>();
    const soundAssets: MemeSoundAsset[] = [];

    for (const dir of soundDirs) {
      if (!fs.existsSync(dir)) continue;

      const files = fs.readdirSync(dir);
      for (const file of files) {
        const lower = file.toLowerCase();
        if (!lower.match(/\.(mp3|wav|m4a|aac|ogg)$/i)) continue;
        if (seenFiles.has(lower)) continue;
        seenFiles.add(lower);

        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.size < 100) continue;

        const catInfo = catalogMap.get(lower);
        const soundName = catInfo?.name || file.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
        const assignedCat = this.classifySound(soundName, lower);

        // Approximate duration if not in catalog: approx 128kbps ~ 16KB/s
        const duration = catInfo?.duration || Math.max(0.4, Number((stat.size / 16000).toFixed(2)));

        soundAssets.push({
          id: catInfo?.id || `sfx_${file.replace(/[^a-zA-Z0-9]/g, '_')}`,
          name: soundName,
          category: assignedCat,
          filename: file,
          filePath: fullPath,
          webPath: `/api/media/sfx/${file}`,
          duration,
          defaultVolume: assignedCat === 'shock' || assignedCat === 'punch' ? 0.95 : 0.85,
          tags: [assignedCat, ...soundName.toLowerCase().split(' ')],
        });
      }
    }

    this.library = soundAssets;
    this.isLoaded = true;
    console.log(`[SoundLibrary] ✓ Loaded ${this.library.length} verified existing meme sound files from local storage.`);
    return this.library;
  }

  /**
   * Intelligently classify a sound file into one of the 14 mandatory categories
   */
  private classifySound(name: string, filename: string): MemeSoundAsset['category'] {
    const s = `${name} ${filename}`.toLowerCase();

    // 1. Sad violin
    if (s.includes('sad') || s.includes('violin') || s.includes('emotional') || s.includes('crying') || s.includes('wasted')) {
      return 'sad_violin';
    }
    // 2. Heavy laughter / Laughing
    if (s.includes('heavy laugh') || s.includes('evil laugh') || s.includes('hysterical') || s.includes('rizzbot laugh')) {
      return 'heavy_laughter';
    }
    if (s.includes('laugh') || s.includes('giggle') || s.includes('chuckle') || s.includes('haha') || s.includes('pewdiepie')) {
      return 'laughing';
    }
    // 3. Bruh
    if (s.includes('bruh') || s.includes('vine boom') || s.includes('vine-boom') || s.includes('what the hell') || s.includes('faaah') || s.includes('fahhhhh')) {
      return 'bruh';
    }
    // 4. Record scratch
    if (s.includes('scratch') || s.includes('freeze frame') || s.includes('rewind')) {
      return 'record_scratch';
    }
    // 5. Punch / Explosion / Impact
    if (s.includes('punch') || s.includes('hit') || s.includes('explosion') || s.includes('boom') || s.includes('slam') || s.includes('whack') || s.includes('death')) {
      return 'punch';
    }
    // 6. Cartoon / Boing
    if (s.includes('boing') || s.includes('cartoon') || s.includes('spring') || s.includes('pop') || s.includes('squirt') || s.includes('twang') || s.includes('oof')) {
      return 'cartoon';
    }
    // 7. Shock / Alarm
    if (s.includes('danger') || s.includes('alarm') || s.includes('shock') || s.includes('gasp') || s.includes('scream') || s.includes('alert')) {
      return 'shock';
    }
    // 8. Suspense
    if (s.includes('suspense') || s.includes('tension') || s.includes('creepy') || s.includes('whisper') || s.includes('heartbeat')) {
      return 'suspense';
    }
    // 9. Dramatic
    if (s.includes('dramatic') || s.includes('dun dun') || s.includes('orchestra') || s.includes('horn') || s.includes('brass')) {
      return 'dramatic';
    }
    // 10. Fail
    if (s.includes('fail') || s.includes('wrong') || s.includes('buzzer') || s.includes('fart') || s.includes('trombone') || s.includes('bye bye')) {
      return 'fail';
    }
    // 11. Victory
    if (s.includes('victory') || s.includes('win') || s.includes('booyah') || s.includes('success') || s.includes('level up') || s.includes('cheer')) {
      return 'victory';
    }
    // 12. Surprise
    if (s.includes('what da dog') || s.includes('are baap re') || s.includes('wow') || s.includes('nani') || s.includes('ding')) {
      return 'surprise';
    }
    // 13. Funny reaction
    if (s.includes('matlab') || s.includes('banda') || s.includes('meme') || s.includes('funny') || s.includes('joke')) {
      return 'funny_reaction';
    }

    return 'funny_reaction';
  }

  /**
   * Recommend matching existing sound effects based on the gameplay event context
   */
  public recommendSounds(event: {
    category: string;
    description: string;
    peakMoment: string;
    clipDuration: number;
  }): Array<{ sfxId: string; sfxPath: string; name: string; timestamp: number; volume: number; category: string }> {
    const sounds = this.loadSoundLibrary();
    const desc = `${event.category} ${event.description} ${event.peakMoment}`.toLowerCase();
    const result: Array<{ sfxId: string; sfxPath: string; name: string; timestamp: number; volume: number; category: string }> = [];

    // Helper to get random sound from a category
    const pickSound = (cat: MemeSoundAsset['category'], excludeIds: Set<string> = new Set()) => {
      const candidates = sounds.filter((s) => s.category === cat && !excludeIds.has(s.id));
      if (candidates.length > 0) {
        return candidates[Math.floor(Math.random() * candidates.length)];
      }
      return sounds[Math.floor(Math.random() * sounds.length)];
    };

    const usedIds = new Set<string>();

    // Opening hook effect (0.2s - 0.4s)
    const hookSound = pickSound('surprise', usedIds);
    if (hookSound) {
      usedIds.add(hookSound.id);
      result.push({
        sfxId: hookSound.id,
        sfxPath: hookSound.filePath,
        name: hookSound.name,
        timestamp: 0.3,
        volume: 0.8,
        category: hookSound.category,
      });
    }

    // Peak event climax sound (around 50-70% through clip)
    const peakTime = Math.min(event.clipDuration - 2.0, Math.max(1.8, event.clipDuration * 0.58));

    let climaxSound: MemeSoundAsset;
    if (desc.includes('crash') || desc.includes('collision') || desc.includes('car')) {
      // Car crash -> Record scratch or explosion
      climaxSound = pickSound('record_scratch', usedIds) || pickSound('punch', usedIds);
    } else if (desc.includes('fall') || desc.includes('drop') || desc.includes('jump')) {
      // Fall -> Cartoon falling or bruh
      climaxSound = pickSound('cartoon', usedIds) || pickSound('bruh', usedIds);
    } else if (desc.includes('chase') || desc.includes('police') || desc.includes('siren')) {
      // Police pursuit -> Dramatic or suspense
      climaxSound = pickSound('dramatic', usedIds) || pickSound('suspense', usedIds);
    } else if (desc.includes('stunt') || desc.includes('trick') || desc.includes('win')) {
      // Stunt -> Victory or surprise
      climaxSound = pickSound('victory', usedIds) || pickSound('surprise', usedIds);
    } else if (desc.includes('fail') || desc.includes('wasted') || desc.includes('died')) {
      // Fail -> Fail buzzer or sad violin
      climaxSound = pickSound('fail', usedIds) || pickSound('sad_violin', usedIds);
    } else {
      // Default to punch or bruh
      climaxSound = pickSound('punch', usedIds) || pickSound('bruh', usedIds);
    }

    if (climaxSound) {
      usedIds.add(climaxSound.id);
      result.push({
        sfxId: climaxSound.id,
        sfxPath: climaxSound.filePath,
        name: climaxSound.name,
        timestamp: Number(peakTime.toFixed(2)),
        volume: 0.95,
        category: climaxSound.category,
      });
    }

    // Reaction sound near ending (1.5s - 2.5s before end)
    const reactionTime = Math.max(peakTime + 1.2, event.clipDuration - 1.8);
    if (reactionTime < event.clipDuration - 0.5) {
      const reactionSound = desc.includes('fail')
        ? pickSound('laughing', usedIds)
        : pickSound('heavy_laughter', usedIds) || pickSound('funny_reaction', usedIds);

      if (reactionSound) {
        usedIds.add(reactionSound.id);
        result.push({
          sfxId: reactionSound.id,
          sfxPath: reactionSound.filePath,
          name: reactionSound.name,
          timestamp: Number(reactionTime.toFixed(2)),
          volume: 0.85,
          category: reactionSound.category,
        });
      }
    }

    return result;
  }

  public getAllSounds(): MemeSoundAsset[] {
    return this.loadSoundLibrary();
  }

  public getSoundsByCategory(cat: MemeSoundAsset['category']): MemeSoundAsset[] {
    return this.loadSoundLibrary().filter((s) => s.category === cat);
  }
}

export const soundLibrary = new ExistingSoundLibrary();

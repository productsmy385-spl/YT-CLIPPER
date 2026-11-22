import { initDatabase, rawDb } from '../src/db/index.ts';
import { dbRepo } from '../src/db/repository.ts';

initDatabase();

console.log('[CreatorSeeder] Seeding initial Content Rights and Creator Authorizations...');

const creators = [
  {
    id: 'creator_brucedropemoff',
    name: 'BruceDropEmOff',
    channelId: 'UC6vT99WjP24f_Jg7oA1p03g',
    channelUrl: 'https://www.youtube.com/@BruceDropEmOff',
    contactEmail: 'mgmt@brucedropemoff.com',
    status: 'verified',
    notes: 'Official creator written consent for GTA 6 gameplay derivative vertical Shorts.',
    permission: {
      status: 'VERIFIED',
      allowedUsage: 'all',
      commercialUsageAllowed: true,
      mediaAccessMethod: 'authorized_upload',
      notes: 'Written creator agreement signed for unlimited vertical shorts and monetization.',
    },
  },
  {
    id: 'creator_kaicenat',
    name: 'Kai Cenat Stream Clips',
    channelId: 'UCGjI_G7r4yX3sO2qC_c9r-A',
    channelUrl: 'https://www.youtube.com/@KaiCenat',
    contactEmail: 'licensing@kaicenatmedia.com',
    status: 'verified',
    notes: 'Authorized partner for livestream reaction clips and highlight syndication.',
    permission: {
      status: 'VERIFIED',
      allowedUsage: 'derivative_shorts',
      commercialUsageAllowed: true,
      mediaAccessMethod: 'licensed_feed',
      notes: 'Partner feed sync agreement with automated vertical shorts rights.',
    },
  },
  {
    id: 'creator_cc_gaming',
    name: 'Open Gaming Archive (Creative Commons)',
    channelId: 'UC_OpenGamingArchive_CC',
    channelUrl: 'https://www.youtube.com/@OpenGamingCC',
    contactEmail: 'archive@opengaming.org',
    status: 'verified',
    notes: 'Verified repository of gameplay videos released under Creative Commons CC BY 4.0.',
    permission: {
      status: 'CREATIVE_COMMONS',
      allowedUsage: 'all',
      commercialUsageAllowed: true,
      mediaAccessMethod: 'licensed_feed',
      notes: 'Creative Commons Attribution (CC BY 4.0) compliant repository.',
    },
  },
  {
    id: 'creator_vice_speedruns',
    name: 'Vice City Speedrun Club',
    channelId: 'UC_ViceCitySpeedruns_Pending',
    channelUrl: 'https://www.youtube.com/@ViceCitySpeedruns',
    contactEmail: 'contact@vicespeedruns.net',
    status: 'pending',
    notes: 'Permission requested on 2026-11-20. Pending signed licensing addendum.',
    permission: {
      status: 'PENDING',
      allowedUsage: 'shorts_only',
      commercialUsageAllowed: false,
      mediaAccessMethod: 'authorized_upload',
      notes: 'Awaiting verified identity and signed permission form.',
    },
  },
  {
    id: 'creator_sunset_gtas',
    name: 'Sunset Drift Stunts',
    channelId: 'UC_SunsetDrift_Expired',
    channelUrl: 'https://www.youtube.com/@SunsetDrift',
    contactEmail: 'drift@sunsetmedia.com',
    status: 'verified',
    notes: 'Annual license expired on 2026-01-15. Renewal required.',
    permission: {
      status: 'EXPIRED',
      allowedUsage: 'all',
      commercialUsageAllowed: true,
      expiryDate: '2026-01-15T00:00:00.000Z',
      mediaAccessMethod: 'authorized_upload',
      notes: 'Expired 1-year syndication agreement.',
    },
  },
];

for (const c of creators) {
  dbRepo.saveCreator({
    id: c.id,
    name: c.name,
    channelId: c.channelId,
    channelUrl: c.channelUrl,
    contactEmail: c.contactEmail,
    status: c.status,
    notes: c.notes,
  });

  dbRepo.saveCreatorPermission({
    id: `perm_${c.id}`,
    creatorId: c.id,
    channelId: c.channelId,
    status: c.permission.status,
    allowedUsage: c.permission.allowedUsage,
    commercialUsageAllowed: c.permission.commercialUsageAllowed,
    expiryDate: c.permission.expiryDate,
    mediaAccessMethod: c.permission.mediaAccessMethod,
    notes: c.permission.notes,
  });
}

// Seed sample attribution
dbRepo.saveAttributionRecord({
  id: 'att_sample_01',
  videoId: 'UckZ7N_Zt28',
  title: 'GTA 6 Vice Beach Stunt Run',
  creatorName: 'Open Gaming Archive (Creative Commons)',
  sourceUrl: 'https://www.youtube.com/watch?v=UckZ7N_Zt28',
  licenseType: 'creative_commons',
  attributionText: 'Original Video: "GTA 6 Vice Beach Stunt Run" by Open Gaming Archive (https://www.youtube.com/watch?v=UckZ7N_Zt28), licensed under Creative Commons Attribution 4.0 International (CC BY 4.0). Derivative vertical Short produced with AI Shorts Studio.',
});

console.log('[CreatorSeeder] ✓ Successfully seeded 5 creators and permissions!');

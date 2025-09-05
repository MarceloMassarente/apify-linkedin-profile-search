import { ApiPagination, Profile, ProfileShort } from '@harvestapi/scraper';
import { Actor } from 'apify';
import { ProfileScraperMode } from './types.js';

export async function pushItem({
  item,
  payments,
  pagination,
  profileScraperMode,
}: {
  item: Profile | ProfileShort;
  payments: string[];
  pagination: ApiPagination | null;
  profileScraperMode: ProfileScraperMode;
}) {
  console.info(`Scraped profile ${item.linkedinUrl || item?.publicIdentifier || item?.id}`);

  item = {
    ...item,
    _meta: {
      pagination,
    },
  } as (Profile | ProfileShort) & { _meta: { pagination: ApiPagination | null } };

  let pushResult: { eventChargeLimitReached: boolean } | null = null;
  if (profileScraperMode === ProfileScraperMode.SHORT) {
    await Actor.pushData(item);
  }
  if (profileScraperMode === ProfileScraperMode.FULL) {
    pushResult = await Actor.pushData(item, 'full-profile');
  }
  if (profileScraperMode === ProfileScraperMode.EMAIL) {
    if ((payments || []).includes('linkedinProfileWithEmail')) {
      pushResult = await Actor.pushData(item, 'full-profile-with-email');
    } else {
      pushResult = await Actor.pushData(item, 'full-profile');
    }
  }

  if (pushResult?.eventChargeLimitReached) {
    await Actor.exit({
      statusMessage: 'max charge reached',
    });
  }
}

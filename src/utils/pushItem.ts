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

  // Removido sistema de cobrança - actor privado
  await Actor.pushData(item);
}

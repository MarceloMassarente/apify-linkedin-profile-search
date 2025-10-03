import { ApiPagination, Profile, ProfileShort } from '@harvestapi/scraper';
import { Actor } from 'apify';

export async function pushItem({
  item,
  pagination,
}: {
  item: Profile | ProfileShort;
  payments: string[];
  pagination: ApiPagination | null;
  profileScraperMode: any;
}) {
  console.info(`Scraped profile ${item.linkedinUrl || item?.publicIdentifier || item?.id}`);
  
  item = {
    ...item,
    _meta: {
      pagination,
    },
  } as (Profile | ProfileShort) & { _meta: { pagination: ApiPagination | null } };

  // Sistema de cobrança removido - actor privado
  await Actor.pushData(item);
}

// Apify SDK - toolkit for building Apify Actors (Read more at https://docs.apify.com/sdk/js/).
import { Actor } from 'apify';
import { config } from 'dotenv';
import { createLinkedinScraper, Profile } from '@harvestapi/scraper';

config();

// this is ESM project, and as such, it requires you to specify extensions in your relative imports
// read more about this here: https://nodejs.org/docs/latest-v18.x/api/esm.html#mandatory-file-extensions
// note that we need to use `.js` even when inside TS files
// import { router } from './routes.js';

// The init() call configures the Actor for its environment. It's recommended to start every Actor with an init().
await Actor.init();

interface Input {
  searchQueries?: string[];
  company?: string[];
  companyIds?: string[];
  companyPublicIdentifiers?: string[];
  companyUrls?: string[];
  school?: string[];
  schoolIds?: string[];
  schoolPublicIdentifiers?: string[];
  schoolUrls?: string[];
  geoIds?: string[];
  locations?: string[];
  maxItems?: number;
  outputHidden?: boolean;
}
// Structure of input is defined in input_schema.json
const input = await Actor.getInput<Input>();
if (!input) throw new Error('Input is missing!');
input.searchQueries = (input.searchQueries || []).filter((q) => q && !!q.trim());
if (!input.searchQueries?.length)
  throw new Error('Search queries: at least one query is required!');

const query: {
  company: string[];
  companyId: string[];
  companyUniversalName: string[];
  school: string[];
  schoolId: string[];
  schoolUniversalName: string[];
  geoId: string[];
  location: string[];
} = {
  company: input.company || [],
  companyId: input.companyIds || [],
  companyUniversalName: [...(input.companyPublicIdentifiers || []), ...(input.companyUrls || [])],
  school: input.school || [],
  schoolId: input.schoolIds || [],
  schoolUniversalName: [...(input.schoolPublicIdentifiers || []), ...(input.schoolUrls || [])],
  geoId: input.geoIds || [],
  location: input.locations || [],
};

const { actorId, actorRunId, actorBuildId, userId, actorMaxPaidDatasetItems, memoryMbytes } =
  Actor.getEnv();

const scraper = createLinkedinScraper({
  apiKey: process.env.HARVESTAPI_TOKEN!,
  baseUrl: process.env.HARVESTAPI_URL || 'https://api.harvest-api.com',
  addHeaders: {
    'x-apify-userid': userId!,
    'x-apify-actor-id': actorId!,
    'x-apify-actor-run-id': actorRunId!,
    'x-apify-actor-build-id': actorBuildId!,
    'x-apify-memory-mbytes': String(memoryMbytes),
    'x-apify-actor-max-paid-dataset-items': String(actorMaxPaidDatasetItems) || '0',
  },
});

let maxItems = Number(input.maxItems) || actorMaxPaidDatasetItems || undefined;
if (actorMaxPaidDatasetItems && maxItems && maxItems > actorMaxPaidDatasetItems) {
  maxItems = actorMaxPaidDatasetItems;
}

for (const searchQuery of input.searchQueries) {
  await scraper.scrapeProfiles({
    query: {
      search: searchQuery,
      ...query,
    },
    outputType: 'callback',
    onItemScraped: async ({ item }) => {
      console.info(`Scraped profile ${item.publicIdentifier || item?.id}`);
      await Actor.pushData(item);
    },
    optionsOverride: {
      fetchItem: async ({ item }) => {
        if (item?.publicIdentifier)
          return scraper.getProfile({ publicIdentifier: item.publicIdentifier });

        if (input.outputHidden && item.id) {
          return {
            element: item as Profile,
            entityId: item.id,
            status: 200,
            error: null,
            query: {},
          };
        }
        return { skipped: true };
      },
    },
    overrideConcurrency: 6,
    maxItems,
  });
}

// Gracefully exit the Actor process. It's recommended to quit all Actors with an exit().
await Actor.exit();

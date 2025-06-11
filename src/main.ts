// Apify SDK - toolkit for building Apify Actors (Read more at https://docs.apify.com/sdk/js/).
import {
  createLinkedinScraper,
  Profile,
  ProfileShort,
  ScrapeLinkedinSalesNavLeadsParams,
} from '@harvestapi/scraper';
import { Actor } from 'apify';
import { config } from 'dotenv';

config();

// The init() call configures the Actor for its environment. It's recommended to start every Actor with an init().
await Actor.init();

interface Input {
  profileScraperMode: 'Short ($3 per 1k)' | 'Full ($7 per 1k)';
  searchQueries?: string[];
  currentCompanies?: string[];
  pastCompanies?: string[];
  currentJobTitles?: string[];
  pastJobTitles?: string[];
  firstNames?: string[];
  lastNames?: string[];
  schools?: string[];
  locations?: string[];
  maxItems?: number;
}
// Structure of input is defined in input_schema.json
const input = await Actor.getInput<Input>();
if (!input) throw new Error('Input is missing!');

if (!input.profileScraperMode) {
  input.profileScraperMode = 'Full ($7 per 1k)';
}

input.searchQueries = (input.searchQueries || []).filter((q) => q && !!q.trim());

const query: {
  currentCompanies: string[];
  pastCompanies: string[];
  schools: string[];
  location: string[];
  currentJobTitles: string[];
  pastJobTitles: string[];
  firstNames: string[];
  lastNames: string[];
} = {
  currentCompanies: input.currentCompanies || [],
  pastCompanies: input.pastCompanies || [],
  schools: input.schools || [],
  location: input.locations || [],
  currentJobTitles: input.currentJobTitles || [],
  pastJobTitles: input.pastJobTitles || [],
  firstNames: input.firstNames || [],
  lastNames: input.lastNames || [],
};

const { actorId, actorRunId, actorBuildId, userId, actorMaxPaidDatasetItems, memoryMbytes } =
  Actor.getEnv();
const client = Actor.newClient();

const user = userId ? await client.user(userId).get() : null;
const cm = Actor.getChargingManager();
const pricingInfo = cm.getPricingInfo();

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
    'x-apify-username': user?.username || '',
    'x-apify-user-is-paying': (user as Record<string, any> | null)?.isPaying,
    'x-apify-max-total-charge-usd': String(pricingInfo.maxTotalChargeUsd),
    'x-apify-is-pay-per-event': String(pricingInfo.isPayPerEvent),
  },
});

const state: {
  lastPromise: Promise<any> | null;
  leftItems: number;
} = {
  lastPromise: null,
  leftItems: actorMaxPaidDatasetItems || 1000000,
};
if (input.maxItems && input.maxItems < state.leftItems) {
  state.leftItems = input.maxItems;
}

const pushItem = async (item: Profile | ProfileShort) => {
  console.info(`Scraped profile ${item.linkedinUrl || item?.publicIdentifier || item?.id}`);

  if (pricingInfo.isPayPerEvent) {
    if (input.profileScraperMode === 'Short ($3 per 1k)') {
      state.lastPromise = Actor.pushData(
        item,
        (pricingInfo.isPayPerEvent ? 'short-profile' : undefined) as string,
      );
    }
    if (input.profileScraperMode === 'Full ($7 per 1k)') {
      state.lastPromise = Actor.pushData(
        item,
        (pricingInfo.isPayPerEvent ? 'full-profile' : undefined) as string,
      );
    }
  } else {
    state.lastPromise = Actor.pushData(item);
  }
};

const scrapeParams: Omit<ScrapeLinkedinSalesNavLeadsParams, 'query'> = {
  // tryFindEmail: input.findEmails,
  outputType: 'callback',
  onItemScraped: async ({ item }) => {
    return pushItem(item);
  },
  optionsOverride: {
    fetchItem: async ({ item }) => {
      if (item?.id || item?.publicIdentifier) {
        state.leftItems -= 1;
        if (state.leftItems < 0) {
          return { skipped: true, done: true };
        }

        if (input.profileScraperMode === 'Short ($3 per 1k)') {
          pushItem(item);
          return { skipped: true };
        }

        return scraper.getProfile({
          url: `https://www.linkedin.com/in/${item.publicIdentifier || item.id}`,
          // tryFindEmail: input.findEmails,
        });
      }

      return { skipped: true };
    },
  },
  disableLog: true,
  overrideConcurrency: 6,
};

for (const searchQuery of input.searchQueries.length ? input.searchQueries : ['']) {
  if (state.leftItems <= 0) {
    break;
  }

  await scraper.scrapeSalesNavigatorLeads({
    query: {
      search: searchQuery,
      ...query,
    },
    ...scrapeParams,
    maxItems: state.leftItems,
  });
}

await state.lastPromise;

// Gracefully exit the Actor process. It's recommended to quit all Actors with an exit().
await Actor.exit();

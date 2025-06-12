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

enum ProfileScraperMode {
  SHORT = 'Short ($4 per 1k)',
  FULL = 'Full ($8 per 1k)',
}

interface Input {
  profileScraperMode: ProfileScraperMode;
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

const profileScraperMode =
  input.profileScraperMode === ProfileScraperMode.SHORT
    ? ProfileScraperMode.SHORT
    : ProfileScraperMode.FULL;

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

for (const key of Object.keys(query) as (keyof typeof query)[]) {
  if (Array.isArray(query[key]) && query[key].length) {
    query[key] = query[key]
      .map((v) => (v || '').replace(/,/g, ' ').trim())
      .filter((v) => v && v.length);
  }
}

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

if (state.leftItems < 10) {
  console.warn(`Please set at least 10 items to scrape.`);
  await Actor.exit();
  process.exit(0);
}

const pushItem = async (item: Profile | ProfileShort) => {
  console.info(`Scraped profile ${item.linkedinUrl || item?.publicIdentifier || item?.id}`);

  if (pricingInfo.isPayPerEvent) {
    if (profileScraperMode === ProfileScraperMode.SHORT) {
      state.lastPromise = Actor.pushData(item, 'short-profile');
    }
    if (profileScraperMode === ProfileScraperMode.FULL) {
      state.lastPromise = Actor.pushData(item, 'full-profile');
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

        if (profileScraperMode === ProfileScraperMode.SHORT) {
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
  overrideConcurrency: 4,
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

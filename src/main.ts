// Apify SDK - toolkit for building Apify Actors (Read more at https://docs.apify.com/sdk/js/).
import { Actor } from 'apify';
import { config } from 'dotenv';
import { createLinkedinScraper } from '@harvestapi/scraper';

config();

// this is ESM project, and as such, it requires you to specify extensions in your relative imports
// read more about this here: https://nodejs.org/docs/latest-v18.x/api/esm.html#mandatory-file-extensions
// note that we need to use `.js` even when inside TS files
// import { router } from './routes.js';

// The init() call configures the Actor for its environment. It's recommended to start every Actor with an init().
await Actor.init();

interface Input {
  searchQueries?: string[];
  companyIds?: string[];
  companyPublicIdentifiers?: string[];
  companyUrls?: string[];
  schoolIds?: string[];
  schoolPublicIdentifiers?: string[];
  schoolUrls?: string[];
  geoIds?: string[];
  locations?: string[];
  maxItems?: number;
}
// Structure of input is defined in input_schema.json
const input = await Actor.getInput<Input>();
if (!input) throw new Error('Input is missing!');
input.searchQueries = (input.searchQueries || []).filter((q) => q && !!q.trim());
if (!input.searchQueries?.length)
  throw new Error('Search queries: at least one query is required!');

const query: {
  companyId: string[];
  companyUniversalName: string[];
  schoolId: string[];
  schoolUniversalName: string[];
  geoId: string[];
  location: string[];
} = {
  companyId: [],
  companyUniversalName: [],
  schoolId: [],
  schoolUniversalName: [],
  geoId: [],
  location: [],
};

(input.companyPublicIdentifiers || []).forEach((companyUniversalName) => {
  query.companyUniversalName.push(companyUniversalName);
});
(input.companyIds || []).forEach((companyId) => {
  query.companyId.push(companyId);
});
(input.companyUrls || []).forEach((companyUrl) => {
  query.companyUniversalName.push(companyUrl);
});

(input.schoolIds || []).forEach((schoolId) => {
  query.schoolId.push(schoolId);
});
(input.schoolPublicIdentifiers || []).forEach((profilePublicIdentifier) => {
  query.schoolUniversalName.push(profilePublicIdentifier);
});
(input.schoolUrls || []).forEach((schoolUrl) => {
  query.schoolUniversalName.push(schoolUrl);
});
(input.geoIds || []).forEach((geoId) => {
  query.geoId.push(geoId);
});
(input.locations || []).forEach((location) => {
  query.location.push(location);
});

const USER_ID = Actor.getEnv().userId;

const scraper = createLinkedinScraper({
  apiKey: process.env.HARVESTAPI_TOKEN!,
  baseUrl: process.env.HARVESTAPI_URL || 'https://api.harvest-api.com',
  addHeaders: {
    'x-apify-userid': USER_ID!,
  },
});

let maxItems = Number(input.maxItems) || 1000;
if (maxItems > 1000) {
  console.warn(`Max items is limited to 1000. Setting it to 1000.`);
  maxItems = 1000;
}

for (const searchQuery of input.searchQueries) {
  await scraper.scrapeProfiles({
    query: {
      search: searchQuery,
      ...query,
    },
    outputType: 'callback',
    onItemScraped: async ({ item }) => {
      console.info(`Scraped profile ${item.publicIdentifier}`);
      void Actor.pushData(item);
    },
    overrideConcurrency: 5,
    maxItems,
  });
}

// Gracefully exit the Actor process. It's recommended to quit all Actors with an exit().
await Actor.exit();

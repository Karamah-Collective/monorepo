/* 
   TEMPLATE: Copy this to config.local.js and fill in your local API keys
   config.local.js will be git-ignored and used only for local development
   
   In Cloudflare Pages, set these as environment variables in the Pages project settings
*/

export const DIGITRANSIT_URL     = 'https://api.digitransit.fi/routing/v2/hsl/gtfs/v1';
export const DIGITRANSIT_WALTTI_URL = 'https://api.digitransit.fi/routing/v2/waltti/gtfs/v1';
export const DIGITRANSIT_GEO_URL = 'https://api.digitransit.fi/geocoding/v1/search';
export const DIGITRANSIT_REV_URL = 'https://api.digitransit.fi/geocoding/v1/reverse';
export const TRANSITOUS_URL      = 'https://api.transitous.org/api/v5/plan';
export const DT_API_KEY          = 'your-digitransit-api-key-here';
export const NOMINATIM_REV       = 'https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&addressdetails=1';
export const NOMINATIM_VB        = '24.0,60.8,25.8,59.8';
export const HF_TOKEN_KEY        = 'your-strong-random-key-here';
export const SHEETS_URL          = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';

// Firebase Auth config is NOT listed here — it isn't secret (it's public
// client config baked into every Firebase web app's JS bundle), so it's
// hardcoded directly as FIREBASE_CONFIG in src/config.js instead of following
// the config.local.js/api/config indirection the keys above use.

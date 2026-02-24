/* 
   Build script for Cloudflare Pages deployment
   Generates config.js from environment variables
   
   Run locally: node build-secrets.js
   Configure in Cloudflare Pages Build settings:
   Build command: node build-secrets.js
   Build output directory: (leave as default)
*/

const fs = require('fs');
const path = require('path');

const config = `/* Auto-generated from environment variables - do not commit */

export const DIGITRANSIT_URL = '${process.env.DIGITRANSIT_URL || 'https://api.digitransit.fi/routing/v2/hsl/gtfs/v1'}';
export const TRANSITOUS_URL = '${process.env.TRANSITOUS_URL || 'https://api.transitous.org/api/v5/plan'}';
export const DT_API_KEY = '${process.env.DT_API_KEY || ''}';
export const NOMINATIM_REV = '${process.env.NOMINATIM_REV || 'https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&addressdetails=1'}';
export const NOMINATIM_VB = '${process.env.NOMINATIM_VB || '24.0,60.8,25.8,59.8'}';
`;

const outPath = path.join(__dirname, '../src/config.local.js');
fs.writeFileSync(outPath, config);
console.log('✓ Generated src/config.local.js from environment variables');


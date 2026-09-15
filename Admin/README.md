# Karamah Admin

React/Vite administration for the Maps and Website workspaces. The shared shell, dashboard, responsive collections and command menu are documented in [DESIGN.md](DESIGN.md).

From the repository root, run `npm ci` then `npm run dev:admin`. This starts Maps on 8788, Website on 8789 and Admin on 5173. `npm run dev:ui` inside this folder starts only Vite and expects both API services to be running already.

Deployment root: `Admin`. Output: `dist`. Follow [the deployment guide](../DEPLOYMENT.md).

Website routes use `Website/functions/api/admin.js`, verified Firebase accounts and the existing Google Sheets store. Map routes use `Maps/functions/api/admin.js` and the existing D1 store. Website credentials belong only in the Website service and Apps Script properties.

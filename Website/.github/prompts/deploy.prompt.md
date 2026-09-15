# Website deployment

Follow [the monorepo deployment guide](../../../DEPLOYMENT.md). The Website Pages project is connected to the shared repository with root `Website` and output `dist`.

Build from the repository root with `npm run build:website`. Validate with `npm run test:website` and `npm run test:website:ui`. Deployment requires the normal authorization for the user's task.

The former script that automatically committed and pushed three branches is retired. Keep the whole monorepo on deployment branches. Configure Sheets/Apps Script secrets on the Website service only.

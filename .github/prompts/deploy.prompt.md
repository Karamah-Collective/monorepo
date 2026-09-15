---
description: Use the master deploy agent to validate and prepare Karamah deployment branches.
---

# Master deploy agent

Use `tooling/deploy-agent.mjs` as the single deployment workflow for this monorepo.

Branch model:

- `main` is the full collaboration branch. It keeps source, docs, tests, prompts, local tooling and project history.
- `preview` is a generated deployment branch. It contains only files Cloudflare Pages needs to build and run Maps, Website and Admin.
- `deploy` is a generated production deployment branch with the same filtered shape as `preview`.

Do not hand-copy files into `preview` or `deploy`. Do not edit those branches directly. Make source changes on `main`, then regenerate the deployment branch.

Commands:

```sh
npm run deploy:agent -- plan main
npm run deploy:agent -- validate main
npm run deploy:agent -- sync preview
npm run deploy:agent -- sync deploy
```

Add `--push` to a `sync` command only when the user has asked to publish branches:

```sh
npm run deploy:agent -- sync preview --push
npm run deploy:agent -- sync deploy --push
```

The agent detects changed scopes from paths:

- Maps changes run Maps build/test logic.
- Website changes run Website build/test logic.
- Admin changes run Admin build/test logic.
- Shared/root deployment changes run the affected app checks plus `npm run check`.

Cloudflare Pages should point each project at the right branch and root directory:

| Environment | Branch | Maps root | Website root | Admin root |
| --- | --- | --- | --- | --- |
| Preview | `preview` | `Maps` | `Website` | `Admin` |
| Production | `deploy` | `Maps` | `Website` | `Admin` |

Changing Apps Script, Cloudflare variables/secrets, custom domains, Firebase authorized domains, or D1 bindings is still an external dashboard/editor step. The deploy agent never writes secrets and never updates remote service settings.

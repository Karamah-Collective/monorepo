# Local-only Admin MCP testing

This runbook is for repository development only. It is not linked from the
Admin product and must not be copied into the production Admin UI.

## 1. Prepare local variables

From the repository root in PowerShell:

```powershell
Copy-Item Maps/.dev.vars.example Maps/.dev.vars
Copy-Item Website/.dev.vars.example Website/.dev.vars
Copy-Item Forms/.dev.vars.example Forms/.dev.vars
Copy-Item Admin/.dev.vars.example Admin/.dev.vars
```

Keep the same `MCP_INTERNAL_SIGNING_KEY` in `Maps/.dev.vars`,
`Website/.dev.vars`, and `Forms/.dev.vars`. The example files already point
the services at the local ports and point MCP OAuth metadata back to local
Admin.

Use a local Firebase configuration that can sign you in. The existing Admin
Firebase project must allow the local origin if you use its real Google sign-in.

## 2. Start the owner services

Open three PowerShell terminals, all at the repository root:

```powershell
# Terminal 1
npm run dev:maps
```

```powershell
# Terminal 2
npm run dev:website
```

```powershell
# Terminal 3
npm run dev:forms
```

Wait for these addresses to be ready:

- Maps: `http://127.0.0.1:8788`
- Website: `http://127.0.0.1:8789`
- Forms: `http://127.0.0.1:8791`

The Maps and Forms development runners prepare their local D1 databases and
apply the migrations, including the MCP tables.

## 3. Serve Admin Pages Functions locally

The normal Admin Vite server is useful for UI work, but it does not serve the
Pages Functions behind `/mcp` and `/oauth/*`. Build Admin, then serve its
`dist` directory through Wrangler Pages:

```powershell
# Terminal 4, from the repository root
npm run build:admin
Set-Location Admin
npx wrangler pages dev dist --port 5173 --ip 127.0.0.1 --persist-to ..\Maps\.wrangler\state
```

Use `http://127.0.0.1:5173`, not the Vite-only server, for this test.

## 4. Confirm the protected endpoint

Open a fifth terminal and run:

```powershell
curl.exe -i http://127.0.0.1:5173/mcp
```

Expected result:

- Status: `401`
- `WWW-Authenticate` points to the local protected-resource metadata route.
- No access token is returned.

Then verify metadata:

```powershell
curl.exe --compressed http://127.0.0.1:5173/.well-known/oauth-protected-resource/mcp
curl.exe --compressed http://127.0.0.1:5173/.well-known/oauth-authorization-server
```

The metadata should advertise local `/oauth/authorize`, `/oauth/token`, and
`/oauth/register` endpoints and `S256` PKCE.

## 5. Register a test MCP client

Most MCP clients perform this step automatically. For a manual smoke test:

```powershell
$registration = Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:5173/oauth/register `
  -ContentType 'application/json' `
  -Body '{"client_name":"Local MCP test","redirect_uris":["http://127.0.0.1:4444/callback"]}'

$registration | ConvertTo-Json
```

Save the returned `client_id`. The redirect URI is exact and case-sensitive.
It must be a loopback or HTTPS URI that your test client actually owns.

## 6. Run OAuth from an MCP client

The easiest local client is the official MCP Inspector. In a fifth terminal:

```powershell
npx @modelcontextprotocol/inspector
```

Open the Inspector URL it prints, usually `http://127.0.0.1:6274`. Enter
`http://127.0.0.1:5173/mcp` as the server URL, select Streamable HTTP, leave
the bearer-token field empty, and click Connect. The Inspector should discover
the local OAuth metadata and open the Admin consent flow.

Configure the client with:

```text
Server URL:  http://127.0.0.1:5173/mcp
Transport:   Streamable HTTP
Auth:        OAuth 2.1 with S256 PKCE
```

When the Inspector or another client opens the browser:

1. Open `http://127.0.0.1:5173/mcp/authorize?...` when redirected.
2. Sign into Firebase.
3. Confirm that the consent page shows the requested scopes.
4. Start with a read-only grant, such as `admin:maps.places.read`.
5. Approve the connection.
6. Return to the MCP client and let it exchange the authorization code.

The client should then call `initialize` and `tools/list`. The listed tools
must match the selected grant and the current role.

## 7. Verify a safe call, a denied call, and a role downgrade

Run these checks in order:

1. With `admin:maps.places.read`, call `maps.places.list`. It should succeed.
2. Call a write tool, such as `maps.places.update`. It should be absent from
   `tools/list` or return a permission error.
3. Grant a write permission, reconnect, and call the same write tool. The first
   call should return `confirmationRequired`.
4. Repeat the exact call with the returned confirmation ID and explicit
   confirmation. It should execute once.
5. Downgrade the user's Admin role in the local access UI.
6. Call `tools/list` again using the same connection. The downgraded tools must
   disappear without issuing a new OAuth connection.
7. Revoke the connection from `/workspace/mcp` and retry. It must return `401`.

Inspect the Admin audit log after the checks. It should contain connection
creation, denied calls, successful writes, confirmation events, and revocation,
without bearer tokens or raw sensitive payloads.

## 8. Fast automated checks

From the repository root:

```powershell
npm run test:mcp
npx playwright test --config Admin/tests/playwright.config.js Admin/tests/mcp.spec.js
```

These tests cover OAuth/PKCE, token rotation, permission filtering, parity,
audit redaction, MCP initialization, and Admin connection consent/revocation.

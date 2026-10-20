// Compatibility entry point; all servers are managed from the monorepo root.
process.argv[2] = 'admin';
await import('../../tooling/dev.mjs');

// Compatibility entry point for the existing Admin Pages project while its
// Cloudflare build configuration is being migrated to the Admin root folder.
// The implementation stays with the Admin application source.
export { onRequest } from "../../Admin/functions/api/admin.js";

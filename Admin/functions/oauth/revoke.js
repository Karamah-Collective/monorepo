import { proxyMcpAuth } from "../_mcp-auth-proxy.js";
export const onRequest = context => proxyMcpAuth(context, "revoke");
export const onRequestPost = onRequest;

import { proxyMcpAuth } from "../_mcp-auth-proxy.js";
export const onRequest = context => proxyMcpAuth(context, "token");
export const onRequestPost = onRequest;

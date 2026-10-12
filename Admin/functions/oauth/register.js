import { proxyMcpAuth } from "../_mcp-auth-proxy.js";
export const onRequest = context => proxyMcpAuth(context, "register");
export const onRequestPost = onRequest;

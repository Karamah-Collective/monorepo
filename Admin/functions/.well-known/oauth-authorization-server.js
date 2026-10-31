import { proxyMcpAuth } from "../_mcp-auth-proxy.js";
export const onRequest = context => proxyMcpAuth(context, "authorization-server");
export const onRequestGet = onRequest;

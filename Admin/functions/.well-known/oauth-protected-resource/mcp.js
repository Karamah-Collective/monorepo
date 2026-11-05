import { proxyMcpAuth } from "../../_mcp-auth-proxy.js";
export const onRequest = context => proxyMcpAuth(context, "protected-resource");
export const onRequestGet = onRequest;

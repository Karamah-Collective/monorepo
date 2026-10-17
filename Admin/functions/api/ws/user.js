import { proxyProjectRealtime } from "../../_project-realtime.js";

export function onRequestGet(context) {
  return proxyProjectRealtime(context);
}

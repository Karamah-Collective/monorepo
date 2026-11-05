import { openProjectRealtime } from "../../_project-realtime.js";

export function onRequestGet(context) {
  return openProjectRealtime({ ...context, channel: "user" });
}

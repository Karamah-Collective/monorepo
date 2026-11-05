import { openProjectRealtime } from "../../_project-realtime.js";

export function onRequestGet(context) {
  const projectId = context.params?.projectId || "";
  return openProjectRealtime({ ...context, channel: "project", projectId });
}

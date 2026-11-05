import { client } from "@karamah/projects-libs";
import type { InferRequestType } from "hono";

type SyncRoute =
  (typeof client)["integration-sync"]["project"][":projectId"][":provider"];
export type SyncParams = InferRequestType<SyncRoute["$get"]>["param"];
export type LabelRule =
  | { mode: "all" }
  | { mode: "labels"; match: "any" | "all"; labels: string[] };
export type SyncRules = { outgoing: LabelRule; incoming: LabelRule };

export type SyncPreview = {
  isActive: boolean;
  rules: SyncRules;
  labels: Array<{ id: string; name: string; color: string | null }>;
  missingLabels: string[];
  total: number;
  matching: number;
  willCreate: number;
  willPause: number;
  needsReview: number;
  paused: number;
  matchingTasks: Array<{ id: string; title: string; number: number | null }>;
  pausedTasks: Array<{
    id: string;
    linkId: string;
    title: string;
    url: string;
    eligible: boolean;
  }>;
  pausedNextCursor: string | null;
  previewToken: string;
};

export type ResumePreview = {
  task: { id: string; title: string; number: number | null };
  local: { title: string; description: string; state: "open" | "closed" };
  remote: { title: string; description: string; state: "open" | "closed" };
  token: string;
};

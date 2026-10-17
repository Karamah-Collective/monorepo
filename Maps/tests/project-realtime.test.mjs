import test from "node:test";
import assert from "node:assert/strict";
import { publishProjectRealtime } from "../functions/_project-realtime.js";

function realtimeEnv() {
  const calls = [];
  return {
    calls,
    PROJECT_REALTIME: {
      idFromName: (name) => name,
      get: (id) => ({
        fetch: async (_url, options) => {
          calls.push({ id, payload: JSON.parse(options.body) });
          return new Response("ok");
        },
      }),
    },
  };
}

test("publishes task changes to the authenticated project's durable object", async () => {
  const env = realtimeEnv();
  await publishProjectRealtime(
    env,
    "project-task-update",
    { id: "task-1", projectId: "project-1" },
    { success: true, task: { id: "task-1", projectId: "project-1" } },
  );
  assert.deepEqual(env.calls, [{
    id: "project:project-1",
    payload: { type: "TASK_UPDATED", projectId: "project-1", taskId: "task-1" },
  }]);
});

test("publishes project changes without leaking task identifiers", async () => {
  const env = realtimeEnv();
  await publishProjectRealtime(
    env,
    "project-update",
    { projectId: "project-1" },
    { success: true, project: { id: "project-1" } },
  );
  assert.deepEqual(env.calls, [{
    id: "project:project-1",
    payload: { type: "PROJECT_UPDATED", projectId: "project-1" },
  }]);
});

test("coalesces bulk task changes into one project-wide invalidation", async () => {
  const env = realtimeEnv();
  env.PROJECTS_DB = {
    prepare: () => ({
      bind: (taskId) => ({ first: async () => ({ project_id: taskId === "task-1" ? "project-1" : "project-1" }) }),
    }),
  };
  await publishProjectRealtime(
    env,
    "project-tasks-bulk",
    {},
    { success: true, results: [{ taskId: "task-1" }, { taskId: "task-2" }] },
  );
  assert.deepEqual(env.calls, [{
    id: "project:project-1",
    payload: { type: "TASK_UPDATED", projectId: "project-1" },
  }]);
});

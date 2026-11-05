import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestAdmin } from "@/lib/karamah-admin";
import updateTaskAssignee from "./update-task-assignee";
import updateTaskDescription from "./update-task-description";
import updateTaskDueDate from "./update-task-due-date";
import updateTaskPriority from "./update-task-priority";
import updateTaskStatus from "./update-task-status";
import updateTaskTitle from "./update-task-title";

vi.mock("@/lib/karamah-admin", () => ({
  requestAdmin: vi.fn(),
}));

const request = vi.mocked(requestAdmin);
const task = {
  id: "task-1",
  revision: 7,
  userId: "member-1",
  status: "in_progress",
  priority: "high",
  title: "Ship the task",
  description: "Details",
  dueDate: "2026-10-20",
} as any;

describe("specialized task mutations", () => {
  beforeEach(() => {
    request.mockResolvedValue(new Response(JSON.stringify({ task: { id: task.id, revision: 8 } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
  });

  it.each([
    ["assignee", () => updateTaskAssignee(task.id, task)],
    ["description", () => updateTaskDescription(task.id, task)],
    ["due date", () => updateTaskDueDate(task.id, task)],
    ["priority", () => updateTaskPriority(task.id, task)],
    ["status", () => updateTaskStatus(task.id, task)],
    ["title", () => updateTaskTitle(task.id, task)],
  ])("sends expectedRevision for %s", async (_label, mutate) => {
    await mutate();
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({ expectedRevision: 7 }),
    }));
  });
});

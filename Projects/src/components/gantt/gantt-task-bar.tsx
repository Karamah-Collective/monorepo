import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateTask } from "@/hooks/mutations/task/use-update-task";
import { cn } from "@/lib/cn";
import { toast, toastSubject } from "@/lib/toast";
import type Task from "@/types/task";

const CLICK_MOVE_THRESHOLD_PX = 4;
const MOBILE_MOVE_THRESHOLD_PX = 14;
const MIN_INLINE_LABEL_PX = 120;
// Below this width a phone bar can't fit two 24px resize handles plus a
// usable move/tap area, so it's left as one target; dates stay editable from
// the task sheet.
const MIN_TOUCH_RESIZABLE_PX = 120;

type ScheduledTask = Task & {
  scheduleStart: Date;
  scheduleEnd: Date;
};

type GanttTaskBarProps = {
  task: ScheduledTask;
  timeline: {
    days: Date[];
    rangeStart: Date;
    gridTemplateColumns: string;
  };
  pixelsPerDay: number;
  isMobile?: boolean;
  onOpenTask: () => void;
};

function getBarGridColumns(
  scheduleStart: Date,
  scheduleEnd: Date,
  rangeStart: Date,
  trackCount: number,
): { barInView: boolean; lineStart: number; lineEnd: number } {
  const startIndex = differenceInCalendarDays(scheduleStart, rangeStart);
  const endIndex = differenceInCalendarDays(scheduleEnd, rangeStart);
  const barInView = endIndex >= 0 && startIndex < trackCount && trackCount > 0;
  if (!barInView) {
    return { barInView: false, lineStart: 1, lineEnd: 1 };
  }
  const lineStart = Math.max(1, Math.min(startIndex + 1, trackCount));
  const lineEnd = Math.max(
    lineStart + 1,
    Math.min(endIndex + 2, trackCount + 1),
  );
  return { barInView: true, lineStart, lineEnd };
}

function toIsoDay(d: Date) {
  return startOfDay(d).toISOString();
}

function getTimelineScrollState(target: EventTarget | null) {
  const element = (target as HTMLElement | null)?.closest?.<HTMLElement>(
    "[data-timeline-scroll]",
  );
  return {
    element: element ?? null,
    scrollLeft: element?.scrollLeft ?? 0,
  };
}

function getDragDeltaPixels({
  clientX,
  originX,
  originScrollLeft,
  scrollElement,
}: {
  clientX: number;
  originX: number;
  originScrollLeft: number;
  scrollElement: HTMLElement | null;
}) {
  const scrollDelta =
    (scrollElement?.scrollLeft ?? originScrollLeft) - originScrollLeft;
  return clientX - originX + scrollDelta;
}

function getDragDeltaDays({
  clientX,
  originX,
  originScrollLeft,
  scrollElement,
  pixelsPerDay,
}: {
  clientX: number;
  originX: number;
  originScrollLeft: number;
  scrollElement: HTMLElement | null;
  pixelsPerDay: number;
}) {
  return Math.round(
    getDragDeltaPixels({
      clientX,
      originX,
      originScrollLeft,
      scrollElement,
    }) / Math.max(pixelsPerDay, 1),
  );
}

export function GanttTaskBar({
  task,
  timeline,
  pixelsPerDay,
  isMobile = false,
  onOpenTask,
}: GanttTaskBarProps) {
  const { t } = useTranslation();
  const { mutateAsync: updateTask } = useUpdateTask();
  const [dragDisplay, setDragDisplay] = useState<{
    start: Date;
    end: Date;
  } | null>(null);

  // Drop the drag overlay once server data matches
  useEffect(() => {
    if (!dragDisplay) return;
    const startMatches =
      differenceInCalendarDays(task.scheduleStart, dragDisplay.start) === 0;
    const endMatches =
      differenceInCalendarDays(task.scheduleEnd, dragDisplay.end) === 0;
    if (startMatches && endMatches) {
      setDragDisplay(null);
    }
  }, [dragDisplay, task.scheduleEnd, task.scheduleStart]);

  const displayStart = dragDisplay?.start ?? task.scheduleStart;
  const displayEnd = dragDisplay?.end ?? task.scheduleEnd;

  const trackCount = timeline.days.length;
  const { barInView, lineStart, lineEnd } = getBarGridColumns(
    displayStart,
    displayEnd,
    timeline.rangeStart,
    trackCount,
  );

  const startIsVisible =
    differenceInCalendarDays(task.scheduleStart, timeline.rangeStart) >= 0;
  const endIsVisible =
    differenceInCalendarDays(task.scheduleEnd, timeline.rangeStart) <
    trackCount;

  const persistDates = useCallback(
    async (nextStart: Date, nextEnd: Date): Promise<boolean> => {
      try {
        await updateTask({
          ...task,
          startDate: toIsoDay(nextStart),
          dueDate: toIsoDay(nextEnd),
        });
        toast.success(t("tasks:gantt.updateDatesSuccess"), {
          description: [
            toastSubject(task.title),
            `${nextStart.toLocaleDateString()} → ${nextEnd.toLocaleDateString()}`,
          ].join(" · "),
        });
        return true;
      } catch (error) {
        toast.error(t("tasks:gantt.updateDatesError"), {
          description:
            error instanceof Error && error.message ? error.message : undefined,
        });
        return false;
      }
    },
    [task, updateTask, t],
  );

  const pxPerDay = Math.max(pixelsPerDay, 1e-6);
  const moveThresholdPx = isMobile
    ? MOBILE_MOVE_THRESHOLD_PX
    : CLICK_MOVE_THRESHOLD_PX;

  const handleResizeLeftPointerDown = (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const originX = event.clientX;
    const { element: scrollElement, scrollLeft: originScrollLeft } =
      getTimelineScrollState(event.currentTarget);
    const initialStart = task.scheduleStart;
    const initialEnd = task.scheduleEnd;
    const startIdx = differenceInCalendarDays(
      initialStart,
      timeline.rangeStart,
    );
    const endIdx = differenceInCalendarDays(initialEnd, timeline.rangeStart);

    const onMove = (ev: PointerEvent) => {
      const deltaDays = getDragDeltaDays({
        clientX: ev.clientX,
        originX,
        originScrollLeft,
        scrollElement,
        pixelsPerDay: pxPerDay,
      });
      let nextStartIdx = startIdx + deltaDays;
      nextStartIdx = Math.max(0, Math.min(nextStartIdx, endIdx));
      const nextStart = timeline.days[nextStartIdx] ?? initialStart;
      const nextEnd = initialEnd;
      setDragDisplay({ start: nextStart, end: nextEnd });
    };

    const onUp = async (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      if (ev.type === "pointercancel") {
        setDragDisplay(null);
        return;
      }
      const deltaDays = getDragDeltaDays({
        clientX: ev.clientX,
        originX,
        originScrollLeft,
        scrollElement,
        pixelsPerDay: pxPerDay,
      });
      let nextStartIdx = startIdx + deltaDays;
      nextStartIdx = Math.max(0, Math.min(nextStartIdx, endIdx));
      const nextStart = timeline.days[nextStartIdx] ?? initialStart;
      if (nextStart.getTime() === initialStart.getTime()) {
        setDragDisplay(null);
        return;
      }
      const ok = await persistDates(nextStart, initialEnd);
      if (!ok) {
        setDragDisplay(null);
      }
    };

    const onCancel = onUp;

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  };

  const handleResizeRightPointerDown = (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const originX = event.clientX;
    const { element: scrollElement, scrollLeft: originScrollLeft } =
      getTimelineScrollState(event.currentTarget);
    const initialStart = task.scheduleStart;
    const initialEnd = task.scheduleEnd;
    const startIdx = differenceInCalendarDays(
      initialStart,
      timeline.rangeStart,
    );
    const endIdx = differenceInCalendarDays(initialEnd, timeline.rangeStart);

    const onMove = (ev: PointerEvent) => {
      const deltaDays = getDragDeltaDays({
        clientX: ev.clientX,
        originX,
        originScrollLeft,
        scrollElement,
        pixelsPerDay: pxPerDay,
      });
      let nextEndIdx = endIdx + deltaDays;
      nextEndIdx = Math.max(startIdx, Math.min(nextEndIdx, trackCount - 1));
      const nextEnd = timeline.days[nextEndIdx] ?? initialEnd;
      const nextStart = initialStart;
      setDragDisplay({ start: nextStart, end: nextEnd });
    };

    const onUp = async (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      if (ev.type === "pointercancel") {
        setDragDisplay(null);
        return;
      }
      const deltaDays = getDragDeltaDays({
        clientX: ev.clientX,
        originX,
        originScrollLeft,
        scrollElement,
        pixelsPerDay: pxPerDay,
      });
      let nextEndIdx = endIdx + deltaDays;
      nextEndIdx = Math.max(startIdx, Math.min(nextEndIdx, trackCount - 1));
      const nextEnd = timeline.days[nextEndIdx] ?? initialEnd;
      if (nextEnd.getTime() === initialEnd.getTime()) {
        setDragDisplay(null);
        return;
      }
      const ok = await persistDates(initialStart, nextEnd);
      if (!ok) {
        setDragDisplay(null);
      }
    };

    const onCancel = onUp;

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  };

  const handleMovePointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const originX = event.clientX;
    const { element: scrollElement, scrollLeft: originScrollLeft } =
      getTimelineScrollState(event.currentTarget);
    const initialStart = task.scheduleStart;
    const initialEnd = task.scheduleEnd;
    if (!startIsVisible || !endIsVisible) {
      onOpenTask();
      return;
    }
    const durationDays = differenceInCalendarDays(initialEnd, initialStart);
    const startIdx = differenceInCalendarDays(
      initialStart,
      timeline.rangeStart,
    );

    const onMove = (ev: PointerEvent) => {
      const deltaDays = getDragDeltaDays({
        clientX: ev.clientX,
        originX,
        originScrollLeft,
        scrollElement,
        pixelsPerDay: pxPerDay,
      });
      let nextStartIdx = startIdx + deltaDays;
      const maxStart = trackCount - 1 - durationDays;
      nextStartIdx = Math.max(0, Math.min(nextStartIdx, maxStart));
      const nextStart = timeline.days[nextStartIdx] ?? initialStart;
      const nextEnd = addDays(nextStart, durationDays);
      setDragDisplay({ start: nextStart, end: nextEnd });
    };

    const onUp = async (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      if (ev.type === "pointercancel") {
        setDragDisplay(null);
        return;
      }
      const moved = Math.abs(
        getDragDeltaPixels({
          clientX: ev.clientX,
          originX,
          originScrollLeft,
          scrollElement,
        }),
      );
      const deltaDays = getDragDeltaDays({
        clientX: ev.clientX,
        originX,
        originScrollLeft,
        scrollElement,
        pixelsPerDay: pxPerDay,
      });
      let nextStartIdx = startIdx + deltaDays;
      const maxStart = trackCount - 1 - durationDays;
      nextStartIdx = Math.max(0, Math.min(nextStartIdx, maxStart));
      const nextStart = timeline.days[nextStartIdx] ?? initialStart;
      const nextEnd = addDays(nextStart, durationDays);

      if (moved < moveThresholdPx) {
        setDragDisplay(null);
        onOpenTask();
        return;
      }
      if (
        nextStart.getTime() === initialStart.getTime() &&
        nextEnd.getTime() === initialEnd.getTime()
      ) {
        setDragDisplay(null);
        return;
      }
      const ok = await persistDates(nextStart, nextEnd);
      if (!ok) {
        setDragDisplay(null);
      }
    };

    const onCancel = onUp;

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  };

  if (!barInView || lineEnd <= lineStart) {
    return null;
  }

  // Short bars on phones leave no room for the title inside them, so it's
  // drawn just after the bar instead (when the timeline has room for it).
  const barWidthPx = (lineEnd - lineStart) * pxPerDay;
  const labelOutside =
    isMobile && barWidthPx < MIN_INLINE_LABEL_PX && lineEnd <= trackCount;
  const showResizeHandles = !isMobile || barWidthPx >= MIN_TOUCH_RESIZABLE_PX;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[1] grid items-center"
      style={{
        gridTemplateColumns: timeline.gridTemplateColumns,
      }}
    >
      <div
        style={{ gridColumn: `${lineStart} / ${lineEnd}` }}
        className="timeline-task-bar group pointer-events-auto relative mx-1 flex min-h-[44px] min-w-0 items-stretch overflow-hidden rounded-md border text-left text-sm font-medium leading-none shadow-sm sm:h-11 sm:min-h-0"
      >
        {showResizeHandles && (
          <button
            type="button"
            aria-label={t("tasks:gantt.resizeStart")}
            disabled={!startIsVisible}
            onPointerDown={handleResizeLeftPointerDown}
            className={cn(
              "relative z-20 shrink-0 cursor-ew-resize touch-none border-r",
              "min-h-[44px] w-6 sm:min-h-0 sm:w-2",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            )}
          />
        )}
        <button
          type="button"
          aria-label={t("tasks:gantt.taskAriaLabel", { title: task.title })}
          className="relative z-10 min-h-[44px] min-w-0 flex-1 cursor-grab touch-manipulation overflow-hidden px-2 text-left active:cursor-grabbing sm:min-h-0 sm:px-2.5"
          onPointerDown={handleMovePointerDown}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpenTask();
            }
          }}
        >
          <span
            className={cn(
              "block truncate",
              labelOutside && "sr-only",
            )}
          >
            {task.title}
          </span>
        </button>
        {showResizeHandles && (
          <button
            type="button"
            aria-label={t("tasks:gantt.resizeDue")}
            disabled={!endIsVisible}
            onPointerDown={handleResizeRightPointerDown}
            className={cn(
              "relative z-20 shrink-0 cursor-ew-resize touch-none border-l",
              "min-h-[44px] w-6 sm:min-h-0 sm:w-2",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            )}
          />
        )}
      </div>
      {labelOutside && (
        <span
          aria-hidden="true"
          style={{ gridColumn: `${lineEnd} / ${trackCount + 1}` }}
          className="min-w-0 truncate pl-1 text-xs font-medium text-foreground/80"
        >
          {task.title}
        </span>
      )}
    </div>
  );
}

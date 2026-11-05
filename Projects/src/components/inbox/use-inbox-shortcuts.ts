import { Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import useClearReadNotifications from "@/hooks/mutations/notification/use-clear-read-notifications";
import useDeleteNotification from "@/hooks/mutations/notification/use-delete-notification";
import useMarkAllNotificationsAsRead from "@/hooks/mutations/notification/use-mark-all-notifications-as-read";
import useMarkNotificationAsRead from "@/hooks/mutations/notification/use-mark-notification-as-read";
import useMarkNotificationAsUnread from "@/hooks/mutations/notification/use-mark-notification-as-unread";
import { useShortcut } from "@/lib/shortcuts/use-shortcut";
import { toast } from "@/lib/toast";
import type { Notification } from "@/types/notification";

type InboxShortcutsOptions = {
  workspaceId: string;
  notifications: Notification[];
  order: Notification[];
  selectedId: string | undefined;
  onSelect: (notification: Notification) => void;
};

function focusNotification(id: string) {
  const element = document.querySelector<HTMLElement>(
    `[data-notification-id="${id}"]`,
  );
  element?.focus({ preventScroll: true });
  element?.scrollIntoView?.({ block: "nearest" });
}

export function useInboxShortcuts({
  workspaceId,
  notifications,
  order,
  selectedId,
  onSelect,
}: InboxShortcutsOptions) {
  const { t } = useTranslation();
  const { mutateAsync: markAsRead } = useMarkNotificationAsRead();
  const { mutateAsync: markAsUnread } = useMarkNotificationAsUnread();
  const { mutateAsync: markAllAsRead } = useMarkAllNotificationsAsRead(workspaceId);
  const { mutateAsync: deleteNotification } = useDeleteNotification();
  const { mutateAsync: clearRead } = useClearReadNotifications(workspaceId);

  const index = order.findIndex(
    (notification) => notification.id === selectedId,
  );
  const selected = order[index];

  const select = (notification: Notification | undefined) => {
    if (!notification) return;
    onSelect(notification);
    focusNotification(notification.id);
  };

  useShortcut("nextTask", () =>
    select(order[index === -1 ? 0 : Math.min(index + 1, order.length - 1)]),
  );
  useShortcut("previousTask", () =>
    select(order[index === -1 ? order.length - 1 : Math.max(index - 1, 0)]),
  );

  useShortcut(
    "toggleNotificationRead",
    async () => {
      if (!selected) return;
      try {
        if (selected.isRead) {
          await markAsUnread(selected.id);
          toast.success(t("notifications:inbox.markedUnread"));
        } else {
          await markAsRead(selected.id);
          toast.success(t("notifications:inbox.markedRead"));
        }
      } catch (error) {
        toast.error(t("notifications:inbox.actionError"), {
          description:
            error instanceof Error && error.message ? error.message : undefined,
        });
      }
    },
    { enabled: Boolean(selected) },
  );
  useShortcut("markAllNotificationsRead", async () => {
    try {
      await markAllAsRead();
      toast.success(t("notifications:inbox.markedAllRead"));
    } catch (error) {
      toast.error(t("notifications:inbox.actionError"), {
        description:
          error instanceof Error && error.message ? error.message : undefined,
      });
    }
  }, {
    enabled: notifications.some((notification) => !notification.isRead),
  });

  useShortcut(
    "deleteNotification",
    async () => {
      if (!selected) return;
      const next = order[index + 1] ?? order[index - 1];
      try {
        await deleteNotification(selected.id);
        select(next);
        toast.success(t("notifications:inbox.deleted"));
      } catch (error) {
        toast.error(t("notifications:inbox.actionError"), {
          description:
            error instanceof Error && error.message ? error.message : undefined,
        });
      }
    },
    { enabled: Boolean(selected) },
  );
  useShortcut(
    "deleteReadNotifications",
    async () => {
      try {
        await clearRead();
        toast.message(t("notifications:inbox.readCleared"), {
          icon: Trash2Icon,
        });
      } catch (error) {
        toast.error(t("notifications:inbox.actionError"), {
          description:
            error instanceof Error && error.message ? error.message : undefined,
        });
      }
    },
    { enabled: notifications.some((notification) => notification.isRead) },
  );
}

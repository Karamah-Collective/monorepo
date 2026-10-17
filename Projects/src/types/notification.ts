export type Notification = {
  id: string;
  type: string;
  title: string | null;
  content: string | null;
  eventData: unknown;
  createdAt: string;
  isRead: boolean;
  resourceType?: string | null;
  resourceId?: string | null;
};

export type NotificationEventData = Record<string, unknown> | null | undefined;

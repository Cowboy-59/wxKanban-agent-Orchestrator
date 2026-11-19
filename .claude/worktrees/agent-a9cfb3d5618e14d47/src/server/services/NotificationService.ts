import { db } from '~/db/client.js';
import { notifications } from '~/db/schema/notification.js';
import { eq, and, desc } from 'drizzle-orm';
import { createLogger } from '~/server/lib/logger.js';
import type { AppNotification } from '~/shared/types/projects.js';

const logger = createLogger('notification-service');

export class NotificationService {
  static async create(data: {
    userid: string;
    type: string;
    entityid?: string;
    entitytype?: string;
    message: string;
  }): Promise<void> {
    await db.insert(notifications).values({
      userid: data.userid,
      type: data.type,
      entityid: data.entityid ?? null,
      entitytype: data.entitytype ?? null,
      message: data.message,
      read: false,
    });
    logger.debug({ userid: data.userid, type: data.type }, 'Notification created');
  }

  static async getForUser(
    userid: string,
    opts: { unreadonly?: boolean; limit?: number; offset?: number } = {}
  ): Promise<{ notifications: AppNotification[]; unreadcount: number }> {
    const { unreadonly = false, limit = 50, offset = 0 } = opts;

    const conditions = [eq(notifications.userid, userid)];
    if (unreadonly) conditions.push(eq(notifications.read, false));

    const rows = await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdat))
      .limit(limit)
      .offset(offset);

    // Count total unread (always, regardless of filter)
    const allUnread = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userid, userid), eq(notifications.read, false)));

    return {
      notifications: rows.map((r) => ({
        id: r.id,
        type: r.type,
        entityid: r.entityid ?? null,
        entitytype: r.entitytype ?? null,
        message: r.message,
        read: r.read,
        createdat: r.createdat.toISOString(),
      })),
      unreadcount: allUnread.length,
    };
  }

  static async markRead(notificationid: string, userid: string): Promise<boolean> {
    const result = await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, notificationid), eq(notifications.userid, userid)));

    logger.debug({ notificationid }, 'Notification marked read');
    return (result.rowCount ?? 0) > 0;
  }

  static async markAllRead(userid: string): Promise<number> {
    const result = await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.userid, userid), eq(notifications.read, false)));

    const updated = result.rowCount ?? 0;
    logger.debug({ userid, updated }, 'All notifications marked read');
    return updated;
  }
}

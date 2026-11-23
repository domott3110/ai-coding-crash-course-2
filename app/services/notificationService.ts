import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  courseComments,
  courses,
  notifications,
  NotificationType,
  users,
} from "~/db/schema";

// ─── Notification Service ───
// In-app notifications (no email). Currently only produced by the course
// discussion (commentService). Uses positional parameters (project convention).

export function createNotification(
  userId: number,
  actorId: number,
  type: NotificationType,
  courseId: number,
  commentId: number
) {
  return db
    .insert(notifications)
    .values({ userId, actorId, type, courseId, commentId })
    .returning()
    .get();
}

export function getNotificationsForUser(userId: number) {
  return db
    .select({
      id: notifications.id,
      type: notifications.type,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      commentId: notifications.commentId,
      actorName: users.name,
      actorAvatarUrl: users.avatarUrl,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      commentBody: courseComments.body,
    })
    .from(notifications)
    .innerJoin(users, eq(notifications.actorId, users.id))
    .innerJoin(courses, eq(notifications.courseId, courses.id))
    .innerJoin(courseComments, eq(notifications.commentId, courseComments.id))
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .all();
}

export function getUnreadNotificationCount(userId: number): number {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .get();
  return result?.count ?? 0;
}

/**
 * Marks one of the user's notifications as read and returns it (with the
 * course slug, for linking). Returns undefined if it isn't theirs.
 */
export function markNotificationRead(userId: number, notificationId: number) {
  const notification = db
    .select({
      id: notifications.id,
      readAt: notifications.readAt,
      commentId: notifications.commentId,
      courseSlug: courses.slug,
    })
    .from(notifications)
    .innerJoin(courses, eq(notifications.courseId, courses.id))
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId)
      )
    )
    .get();

  if (!notification) return undefined;

  if (!notification.readAt) {
    db.update(notifications)
      .set({ readAt: new Date().toISOString() })
      .where(eq(notifications.id, notificationId))
      .run();
  }

  return notification;
}

export function markAllNotificationsRead(userId: number) {
  db.update(notifications)
    .set({ readAt: new Date().toISOString() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .run();
}

export function deleteNotificationsForComment(commentId: number) {
  db.delete(notifications).where(eq(notifications.commentId, commentId)).run();
}

import { Form, Link, data, redirect } from "react-router";
import { z } from "zod";
import { Bell, CheckCheck } from "lucide-react";
import type { Route } from "./+types/notifications";
import { getCurrentUserId } from "~/lib/session";
import { parseFormData } from "~/lib/validation";
import { NotificationType } from "~/db/schema";
import {
  getNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from "~/services/notificationService";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { UserAvatar } from "~/components/user-avatar";
import { cn } from "~/lib/utils";

export function meta() {
  return [{ title: "Notifications — Cadence" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("You must be logged in to see notifications.", { status: 401 });
  }
  return { notifications: getNotificationsForUser(currentUserId) };
}

const actionSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("open"),
    notificationId: z.coerce.number().int().positive(),
  }),
  z.object({ intent: z.literal("mark-all-read") }),
]);

export async function action({ request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("You must be logged in.", { status: 401 });
  }

  const parsed = parseFormData(await request.formData(), actionSchema);
  if (!parsed.success) {
    throw data("Invalid request.", { status: 400 });
  }

  if (parsed.data.intent === "mark-all-read") {
    markAllNotificationsRead(currentUserId);
    return { ok: true };
  }

  const notification = markNotificationRead(
    currentUserId,
    parsed.data.notificationId
  );
  if (!notification) {
    throw data("Notification not found.", { status: 404 });
  }
  return redirect(
    `/courses/${notification.courseSlug}#comment-${notification.commentId}`
  );
}

const messages: Record<NotificationType, string> = {
  [NotificationType.NewQuestion]: "asked a question in",
  [NotificationType.Reply]: "replied to your post in",
  [NotificationType.ThreadReply]: "replied in your thread in",
  [NotificationType.AnswerAccepted]: "accepted your answer in",
};

export default function Notifications({ loaderData }: Route.ComponentProps) {
  const { notifications } = loaderData;
  const hasUnread = notifications.some((n) => !n.readAt);

  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Notifications</h1>
        {hasUnread && (
          <Form method="post">
            <input type="hidden" name="intent" value="mark-all-read" />
            <Button type="submit" variant="outline" size="sm">
              <CheckCheck className="mr-1.5 size-4" />
              Mark all as read
            </Button>
          </Form>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center text-muted-foreground">
          <Bell className="mb-3 size-10" />
          <p>You're all caught up — no notifications yet.</p>
        </div>
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {notifications.map((n) => (
              <Form method="post" key={n.id}>
                <input type="hidden" name="intent" value="open" />
                <input type="hidden" name="notificationId" value={n.id} />
                <button
                  type="submit"
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60",
                    !n.readAt && "bg-primary/5"
                  )}
                >
                  <UserAvatar
                    name={n.actorName}
                    avatarUrl={n.actorAvatarUrl}
                    className="mt-0.5 size-8 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{n.actorName}</span>{" "}
                      {messages[n.type]}{" "}
                      <span className="font-medium">{n.courseTitle}</span>
                    </p>
                    {n.commentBody && (
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {n.commentBody}
                      </p>
                    )}
                    <time
                      dateTime={n.createdAt}
                      className="text-xs text-muted-foreground"
                      suppressHydrationWarning
                    >
                      {new Date(n.createdAt).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </div>
                  {!n.readAt && (
                    <span
                      className="mt-2 size-2 shrink-0 rounded-full bg-primary"
                      aria-label="Unread"
                    />
                  )}
                </button>
              </Form>
            ))}
          </CardContent>
        </Card>
      )}

      <p className="mt-6 text-center text-xs text-muted-foreground">
        <Link to="/courses" className="hover:underline">
          Browse courses
        </Link>
      </p>
    </div>
  );
}

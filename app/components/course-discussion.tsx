import { useEffect, useRef, useState } from "react";
import { Link, useFetcher, useLocation } from "react-router";
import { toast } from "sonner";
import {
  CheckCircle2,
  CircleHelp,
  CornerDownRight,
  MessageSquare,
  Pencil,
  Reply,
  Trash2,
  Undo2,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import { UserAvatar } from "~/components/user-avatar";
import { CommentKind } from "~/db/schema";
import { MAX_COMMENT_LENGTH } from "~/lib/comments";
import { cn } from "~/lib/utils";
import type {
  DiscussionPost,
  DiscussionReply,
  DiscussionThread,
} from "~/services/commentService";

type ActionResult = { ok: boolean; error: string | null };

type Filter = "all" | "open" | "solved";

type Viewer = {
  userId: number | null;
  canPost: boolean;
  canModerate: boolean;
  courseInstructorId: number;
};

// ─── Helpers ───

const relativeTimeFormat = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

function formatRelativeTime(iso: string): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return relativeTimeFormat.format(Math.round(seconds / size), unit);
    }
  }
  return "just now";
}

function formatAbsoluteTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Shows a toast on error and calls onSuccess once a submission succeeds. */
function useFetcherResult(
  fetcher: ReturnType<typeof useFetcher<ActionResult>>,
  onSuccess?: () => void
) {
  const handled = useRef<unknown>(null);
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (handled.current === fetcher.data) return;
    handled.current = fetcher.data;
    if (fetcher.data.error) {
      toast.error(fetcher.data.error);
    } else if (fetcher.data.ok) {
      onSuccess?.();
    }
  }, [fetcher.state, fetcher.data, onSuccess]);
}

// ─── Section ───

export function CourseDiscussion({
  threads,
  viewer,
  enrollLink,
}: {
  threads: DiscussionThread[];
  viewer: Viewer;
  enrollLink: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const location = useLocation();
  const [highlightedId, setHighlightedId] = useState<number | null>(null);

  // Deep links from notifications: /courses/:slug#comment-123
  useEffect(() => {
    const match = location.hash.match(/^#comment-(\d+)$/);
    if (!match) return;
    const id = Number(match[1]);
    setFilter("all");
    setHighlightedId(id);
    requestAnimationFrame(() => {
      document
        .getElementById(`comment-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [location.hash]);

  const visibleThreads = threads.filter((t) => {
    if (filter === "all") return true;
    if (t.kind !== CommentKind.Question || t.isDeleted) return false;
    return filter === "solved" ? t.isSolved : !t.isSolved;
  });

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "open", label: "Open questions" },
    { value: "solved", label: "Solved" },
  ];

  return (
    <section id="discussion">
      <h2 className="mb-4 text-2xl font-bold">
        Questions &amp; Discussion{" "}
        <span className="text-muted-foreground">({threads.length})</span>
      </h2>

      {viewer.canPost ? (
        <NewPostForm />
      ) : (
        <div className="mb-6 rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
          <Link to={enrollLink} className="font-medium text-primary hover:underline">
            Enroll in this course
          </Link>{" "}
          to ask questions and join the discussion.
        </div>
      )}

      <div className="mb-4 flex gap-1" role="tablist" aria-label="Filter posts">
        {filters.map((f) => (
          <Button
            key={f.value}
            type="button"
            role="tab"
            aria-selected={filter === f.value}
            variant={filter === f.value ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {visibleThreads.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {threads.length === 0
            ? "No posts yet. Be the first to ask a question!"
            : "No posts match this filter."}
        </p>
      ) : (
        <div className="space-y-4">
          {visibleThreads.map((thread) => (
            <ThreadCard
              key={thread.id}
              thread={thread}
              viewer={viewer}
              highlightedId={highlightedId}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── New post ───

function NewPostForm() {
  const fetcher = useFetcher<ActionResult>();
  const formRef = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<CommentKind>(CommentKind.Question);
  const [body, setBody] = useState("");
  const isSubmitting = fetcher.state !== "idle";

  useFetcherResult(fetcher, () => {
    setBody("");
    toast.success(
      kind === CommentKind.Question ? "Question posted." : "Comment posted."
    );
  });

  return (
    <Card className="mb-6">
      <CardContent className="pt-6">
        <fetcher.Form method="post" ref={formRef} className="space-y-3">
          <input type="hidden" name="intent" value="create-comment" />
          <input type="hidden" name="kind" value={kind} />
          <div
            className="inline-flex rounded-md border p-0.5"
            role="radiogroup"
            aria-label="Post type"
          >
            {[
              { value: CommentKind.Question, label: "Question", icon: CircleHelp },
              { value: CommentKind.Comment, label: "Comment", icon: MessageSquare },
            ].map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={kind === value}
                onClick={() => setKind(value)}
                className={cn(
                  "flex items-center gap-1.5 rounded px-3 py-1 text-sm font-medium transition-colors",
                  kind === value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
          <Textarea
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={MAX_COMMENT_LENGTH}
            placeholder={
              kind === CommentKind.Question
                ? "What would you like to ask? The instructor will be notified."
                : "Share a thought with other learners…"
            }
            className="min-h-24"
            required
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {body.length}/{MAX_COMMENT_LENGTH}
            </span>
            <Button type="submit" disabled={isSubmitting || !body.trim()}>
              {kind === CommentKind.Question ? "Ask question" : "Post comment"}
            </Button>
          </div>
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}

// ─── Thread ───

function ThreadCard({
  thread,
  viewer,
  highlightedId,
}: {
  thread: DiscussionThread;
  viewer: Viewer;
  highlightedId: number | null;
}) {
  const isQuestion = thread.kind === CommentKind.Question;
  const viewerCanAccept =
    isQuestion &&
    !thread.isDeleted &&
    viewer.userId !== null &&
    (viewer.userId === thread.author?.id ||
      viewer.userId === viewer.courseInstructorId);
  const acceptedAnswer = thread.replies.find((r) => r.isAccepted);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {isQuestion ? (
            <>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                <CircleHelp className="size-3" />
                Question
              </span>
              {!thread.isDeleted &&
                (thread.isSolved ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
                    <CheckCircle2 className="size-3" />
                    Solved
                  </span>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    Open
                  </span>
                ))}
            </>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              <MessageSquare className="size-3" />
              Comment
            </span>
          )}
        </div>

        <PostView
          post={thread}
          viewer={viewer}
          highlighted={highlightedId === thread.id}
        />

        {acceptedAnswer && (
          <div className="mt-4 rounded-md border border-green-300 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/30">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-green-800 dark:text-green-300">
              <CheckCircle2 className="size-3.5" />
              Accepted answer
              {acceptedAnswer.author && <> by {acceptedAnswer.author.name}</>}
            </div>
            <p className="line-clamp-4 whitespace-pre-wrap text-sm">
              {acceptedAnswer.body}
            </p>
            <a
              href={`#comment-${acceptedAnswer.id}`}
              className="mt-1 inline-block text-xs text-green-800 hover:underline dark:text-green-300"
            >
              Jump to answer
            </a>
          </div>
        )}

        {thread.replies.length > 0 && (
          <div className="mt-4 space-y-3 border-t pt-4">
            {thread.replies.map((reply) => (
              <div
                key={reply.id}
                style={{ marginLeft: `${(reply.depth - 1) * 1.5}rem` }}
                className={cn(
                  reply.depth > 1 && "border-l pl-3",
                  reply.isAccepted &&
                    "rounded-md border border-green-300 bg-green-50/60 p-3 dark:border-green-800 dark:bg-green-950/20"
                )}
              >
                <PostView
                  post={reply}
                  viewer={viewer}
                  highlighted={highlightedId === reply.id}
                  accept={
                    viewerCanAccept &&
                    !reply.isDeleted &&
                    reply.author?.id !== thread.author?.id
                      ? { questionId: thread.id, isAccepted: reply.isAccepted }
                      : undefined
                  }
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Single post ───

function PostView({
  post,
  viewer,
  highlighted,
  accept,
}: {
  post: DiscussionPost | DiscussionReply;
  viewer: Viewer;
  highlighted: boolean;
  accept?: { questionId: number; isAccepted: boolean };
}) {
  const [mode, setMode] = useState<"view" | "reply" | "edit">("view");
  const deleteFetcher = useFetcher<ActionResult>();
  const acceptFetcher = useFetcher<ActionResult>();
  useFetcherResult(deleteFetcher);
  useFetcherResult(acceptFetcher);

  const isAuthor = viewer.userId !== null && post.author?.id === viewer.userId;
  const canReply = viewer.canPost && !post.isDeleted;
  const canEdit = isAuthor && !post.isDeleted;
  const canDelete = !post.isDeleted && (isAuthor || viewer.canModerate);
  const replyingTo = "replyingTo" in post ? post.replyingTo : null;

  return (
    <article
      id={`comment-${post.id}`}
      className={cn(
        "scroll-mt-6 rounded-md transition-shadow",
        highlighted && "ring-2 ring-primary/60 ring-offset-4 ring-offset-background"
      )}
    >
      {post.isDeleted ? (
        <p className="text-sm italic text-muted-foreground">[deleted]</p>
      ) : (
        <>
          <header className="mb-1.5 flex flex-wrap items-center gap-2 text-sm">
            {post.author && (
              <>
                <UserAvatar
                  name={post.author.name}
                  avatarUrl={post.author.avatarUrl}
                  className="size-6"
                />
                <span className="font-medium">{post.author.name}</span>
                {post.author.isInstructor && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                    Instructor
                  </span>
                )}
              </>
            )}
            <time
              dateTime={post.createdAt}
              title={formatAbsoluteTime(post.createdAt)}
              className="text-xs text-muted-foreground"
              suppressHydrationWarning
            >
              {formatRelativeTime(post.createdAt)}
            </time>
            {post.editedAt && (
              <span
                className="text-xs text-muted-foreground"
                title={`Edited ${formatAbsoluteTime(post.editedAt)}`}
                suppressHydrationWarning
              >
                (edited)
              </span>
            )}
            {"isAccepted" in post && post.isAccepted && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
                <CheckCircle2 className="size-3.5" />
                Accepted answer
              </span>
            )}
          </header>

          {replyingTo && (
            <p className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
              <CornerDownRight className="size-3" />
              Replying to @{replyingTo}
            </p>
          )}

          {mode === "edit" ? (
            <PostForm
              intent="edit-comment"
              hidden={{ commentId: post.id }}
              initialBody={post.body}
              submitLabel="Save"
              onDone={() => setMode("view")}
            />
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm">{post.body}</p>
          )}
        </>
      )}

      {mode !== "edit" && (canReply || canEdit || canDelete || accept) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {canReply && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setMode(mode === "reply" ? "view" : "reply")}
            >
              <Reply className="mr-1 size-3.5" />
              Reply
            </Button>
          )}
          {accept && (
            <acceptFetcher.Form method="post">
              <input
                type="hidden"
                name="intent"
                value={accept.isAccepted ? "unaccept-answer" : "accept-answer"}
              />
              <input type="hidden" name="questionId" value={accept.questionId} />
              <input type="hidden" name="answerId" value={post.id} />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-green-700 hover:text-green-800 dark:text-green-400"
                disabled={acceptFetcher.state !== "idle"}
              >
                {accept.isAccepted ? (
                  <>
                    <Undo2 className="mr-1 size-3.5" />
                    Unmark answer
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-1 size-3.5" />
                    Accept answer
                  </>
                )}
              </Button>
            </acceptFetcher.Form>
          )}
          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setMode("edit")}
            >
              <Pencil className="mr-1 size-3.5" />
              Edit
            </Button>
          )}
          {canDelete && (
            <deleteFetcher.Form
              method="post"
              onSubmit={(e) => {
                if (!window.confirm("Delete this post?")) e.preventDefault();
              }}
            >
              <input type="hidden" name="intent" value="delete-comment" />
              <input type="hidden" name="commentId" value={post.id} />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                disabled={deleteFetcher.state !== "idle"}
              >
                <Trash2 className="mr-1 size-3.5" />
                Delete
              </Button>
            </deleteFetcher.Form>
          )}
        </div>
      )}

      {mode === "reply" && (
        <div className="mt-2">
          <PostForm
            intent="reply-comment"
            hidden={{ parentId: post.id }}
            initialBody=""
            placeholder={`Reply to ${post.author?.name ?? "this post"}…`}
            submitLabel="Reply"
            onDone={() => setMode("view")}
          />
        </div>
      )}
    </article>
  );
}

// ─── Inline reply / edit form ───

function PostForm({
  intent,
  hidden,
  initialBody,
  placeholder,
  submitLabel,
  onDone,
}: {
  intent: "reply-comment" | "edit-comment";
  hidden: Record<string, number>;
  initialBody: string;
  placeholder?: string;
  submitLabel: string;
  onDone: () => void;
}) {
  const fetcher = useFetcher<ActionResult>();
  const [body, setBody] = useState(initialBody);
  const isSubmitting = fetcher.state !== "idle";
  useFetcherResult(fetcher, onDone);

  return (
    <fetcher.Form method="post" className="space-y-2">
      <input type="hidden" name="intent" value={intent} />
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Textarea
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={MAX_COMMENT_LENGTH}
        placeholder={placeholder}
        autoFocus
        required
      />
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-xs text-muted-foreground">
          {body.length}/{MAX_COMMENT_LENGTH}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting || !body.trim()}>
          {submitLabel}
        </Button>
      </div>
    </fetcher.Form>
  );
}

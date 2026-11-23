import { eq, and, sql, inArray } from "drizzle-orm";
import { db } from "~/db";
import { courseRatings, courses } from "~/db/schema";
import { isUserEnrolled } from "~/services/enrollmentService";

// ─── Rating Service ───
// Handles star ratings (0.5–5 in half-star steps) for courses.
// Only enrolled users (in progress or completed) may rate a course,
// and instructors may not rate their own course.
// Uses positional parameters (project convention).

export const MIN_RATING = 0.5;
export const MAX_RATING = 5;

export type CourseRatingSummary = {
  average: number | null;
  count: number;
};

export function isValidRating(rating: number) {
  return (
    Number.isFinite(rating) &&
    rating >= MIN_RATING &&
    rating <= MAX_RATING &&
    Number.isInteger(rating * 2)
  );
}

export function canUserRateCourse(userId: number, courseId: number) {
  const course = db
    .select({ instructorId: courses.instructorId })
    .from(courses)
    .where(eq(courses.id, courseId))
    .get();

  if (!course) return false;
  if (course.instructorId === userId) return false;
  return isUserEnrolled(userId, courseId);
}

export function getUserRatingForCourse(userId: number, courseId: number) {
  return db
    .select()
    .from(courseRatings)
    .where(
      and(
        eq(courseRatings.userId, userId),
        eq(courseRatings.courseId, courseId)
      )
    )
    .get();
}

export function rateCourse(userId: number, courseId: number, rating: number) {
  if (!isValidRating(rating)) {
    throw new Error("Rating must be between 0.5 and 5 in half-star steps");
  }

  const course = db
    .select({ instructorId: courses.instructorId })
    .from(courses)
    .where(eq(courses.id, courseId))
    .get();

  if (!course) {
    throw new Error("Course not found");
  }

  if (course.instructorId === userId) {
    throw new Error("Instructors cannot rate their own course");
  }

  if (!isUserEnrolled(userId, courseId)) {
    throw new Error("Only enrolled users can rate this course");
  }

  const now = new Date().toISOString();

  return db
    .insert(courseRatings)
    .values({ userId, courseId, rating, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [courseRatings.userId, courseRatings.courseId],
      set: { rating, updatedAt: now },
    })
    .returning()
    .get();
}

export function deleteRating(userId: number, courseId: number) {
  return db
    .delete(courseRatings)
    .where(
      and(
        eq(courseRatings.userId, userId),
        eq(courseRatings.courseId, courseId)
      )
    )
    .returning()
    .get();
}

export function getCourseRatingSummary(courseId: number): CourseRatingSummary {
  const result = db
    .select({
      average: sql<number | null>`avg(${courseRatings.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(eq(courseRatings.courseId, courseId))
    .get();

  return {
    average: result?.average ?? null,
    count: result?.count ?? 0,
  };
}

export function getRatingSummariesForCourses(courseIds: number[]) {
  const summaries = new Map<number, CourseRatingSummary>();
  if (courseIds.length === 0) return summaries;

  const rows = db
    .select({
      courseId: courseRatings.courseId,
      average: sql<number>`avg(${courseRatings.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(inArray(courseRatings.courseId, courseIds))
    .groupBy(courseRatings.courseId)
    .all();

  for (const row of rows) {
    summaries.set(row.courseId, { average: row.average, count: row.count });
  }

  return summaries;
}

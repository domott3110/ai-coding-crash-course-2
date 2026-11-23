import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

import {
  isValidRating,
  canUserRateCourse,
  rateCourse,
  getUserRatingForCourse,
  deleteRating,
  getCourseRatingSummary,
  getRatingSummariesForCourses,
} from "./ratingService";

function enroll(userId: number, courseId: number) {
  testDb.insert(schema.enrollments).values({ userId, courseId }).run();
}

function createStudent(email: string) {
  return testDb
    .insert(schema.users)
    .values({ name: email, email, role: schema.UserRole.Student })
    .returning()
    .get();
}

describe("ratingService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("isValidRating", () => {
    it("accepts whole and half stars between 0.5 and 5", () => {
      for (const r of [0.5, 1, 1.5, 2.5, 4, 4.5, 5]) {
        expect(isValidRating(r)).toBe(true);
      }
    });

    it("rejects out-of-range and non-half-step values", () => {
      for (const r of [0, -1, 5.5, 6, 1.25, 3.3, NaN]) {
        expect(isValidRating(r)).toBe(false);
      }
    });
  });

  describe("rateCourse", () => {
    it("lets an enrolled user rate a course with half stars", () => {
      enroll(base.user.id, base.course.id);

      const rating = rateCourse(base.user.id, base.course.id, 3.5);

      expect(rating.rating).toBe(3.5);
      expect(getUserRatingForCourse(base.user.id, base.course.id)?.rating).toBe(
        3.5
      );
    });

    it("updates an existing rating instead of creating a second one", () => {
      enroll(base.user.id, base.course.id);
      rateCourse(base.user.id, base.course.id, 2);
      rateCourse(base.user.id, base.course.id, 4.5);

      const summary = getCourseRatingSummary(base.course.id);
      expect(summary.count).toBe(1);
      expect(summary.average).toBe(4.5);
    });

    it("rejects users who are not enrolled", () => {
      expect(() => rateCourse(base.user.id, base.course.id, 4)).toThrowError(
        "Only enrolled users can rate this course"
      );
    });

    it("rejects the course instructor, even if enrolled", () => {
      enroll(base.instructor.id, base.course.id);

      expect(() =>
        rateCourse(base.instructor.id, base.course.id, 5)
      ).toThrowError("Instructors cannot rate their own course");
    });

    it("rejects invalid rating values", () => {
      enroll(base.user.id, base.course.id);

      expect(() => rateCourse(base.user.id, base.course.id, 2.25)).toThrowError(
        "Rating must be between 0.5 and 5 in half-star steps"
      );
      expect(() => rateCourse(base.user.id, base.course.id, 0)).toThrowError();
    });

    it("rejects non-existent courses", () => {
      expect(() => rateCourse(base.user.id, 9999, 4)).toThrowError(
        "Course not found"
      );
    });
  });

  describe("canUserRateCourse", () => {
    it("is true for enrolled non-instructors only", () => {
      expect(canUserRateCourse(base.user.id, base.course.id)).toBe(false);
      enroll(base.user.id, base.course.id);
      expect(canUserRateCourse(base.user.id, base.course.id)).toBe(true);
      expect(canUserRateCourse(base.instructor.id, base.course.id)).toBe(false);
    });
  });

  describe("deleteRating", () => {
    it("removes the user's rating", () => {
      enroll(base.user.id, base.course.id);
      rateCourse(base.user.id, base.course.id, 4);
      deleteRating(base.user.id, base.course.id);

      expect(getUserRatingForCourse(base.user.id, base.course.id)).toBeUndefined();
      expect(getCourseRatingSummary(base.course.id)).toEqual({
        average: null,
        count: 0,
      });
    });
  });

  describe("summaries", () => {
    it("computes average and count across users", () => {
      const other = createStudent("other@example.com");
      enroll(base.user.id, base.course.id);
      enroll(other.id, base.course.id);
      rateCourse(base.user.id, base.course.id, 5);
      rateCourse(other.id, base.course.id, 3.5);

      expect(getCourseRatingSummary(base.course.id)).toEqual({
        average: 4.25,
        count: 2,
      });

      const map = getRatingSummariesForCourses([base.course.id, 9999]);
      expect(map.get(base.course.id)).toEqual({ average: 4.25, count: 2 });
      expect(map.has(9999)).toBe(false);
    });

    it("returns an empty map for no course ids", () => {
      expect(getRatingSummariesForCourses([]).size).toBe(0);
    });
  });
});

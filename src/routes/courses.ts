import { Router } from "express";
import {
  completeLesson,
  createCourse,
  createLesson,
  deleteCourse,
  deleteLesson,
  enrollCourse,
  featuredCourses,
  getCourseBySlug,
  getCourseLessons,
  getCourseProgress,
  listCourseCategories,
  listCourses,
  unenrollCourse,
  updateCourse,
  updateLesson
} from "../controllers/courseController";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { courseCreateSchema, courseUpdateSchema, lessonCreateSchema, lessonUpdateSchema } from "../schemas/courseSchemas";

const router = Router();

router.get("/course-categories", listCourseCategories);
router.get("/courses", listCourses);
router.get("/courses/featured", featuredCourses);
router.get("/courses/:slug", getCourseBySlug);
router.post("/courses", requireAuth, validate(courseCreateSchema), createCourse);
router.patch("/courses/:id", requireAuth, validate(courseUpdateSchema), updateCourse);
router.delete("/courses/:id", requireAuth, deleteCourse);

router.post("/courses/:id/enroll", requireAuth, enrollCourse);
router.delete("/courses/:id/enroll", requireAuth, unenrollCourse);

router.get("/courses/:id/lessons", getCourseLessons);
router.post("/courses/:id/lessons", requireAuth, validate(lessonCreateSchema), createLesson);
router.patch(
  "/courses/:id/lessons/:lessonId",
  requireAuth,
  validate(lessonUpdateSchema),
  updateLesson
);
router.delete("/courses/:id/lessons/:lessonId", requireAuth, deleteLesson);

router.get("/courses/:id/progress", requireAuth, getCourseProgress);
router.post("/courses/:id/lessons/:lessonId/complete", requireAuth, completeLesson);

export default router;

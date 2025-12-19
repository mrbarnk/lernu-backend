import { Request, Response } from "express";
import { Types } from "mongoose";
import { Course } from "../models/Course";
import { CourseCategory } from "../models/CourseCategory";
import { CourseEnrollment } from "../models/CourseEnrollment";
import { CourseLesson } from "../models/CourseLesson";
import { CourseProgress } from "../models/CourseProgress";
import { HttpError } from "../middleware/error";
import { buildCursorFilter, getNextCursor, parsePagination } from "../utils/pagination";
import { slugify } from "../utils/slug";
import { serializeCourse, serializeCourseLesson, serializeCourseProgress } from "../utils/serializers";

const authorProjection = "username displayName avatar role";

const ensureObjectId = (value: string, message = "Invalid id") => {
  if (!Types.ObjectId.isValid(value)) throw new HttpError(400, message);
};

const userRole = (req: Request) => req.user?.role ?? "user";
const canModerateRole = (role: string) => role === "moderator" || role === "admin";
const hasLevelSeven = (user?: Request["user"]) => typeof user?.level === "number" && user.level >= 7;
const sameId = (a: Types.ObjectId | string, b: Types.ObjectId | string) => a.toString() === b.toString();

const visibilityFilter = (req: Request) => {
  const role = userRole(req);
  if (canModerateRole(role)) return {};
  if (req.user?._id) return { $or: [{ isPublished: true }, { author: req.user._id }] };
  return { isPublished: true };
};

const assertCourseViewable = (course: any, req: Request) => {
  const role = userRole(req);
  if (course.isPublished) return;
  if (canModerateRole(role)) return;
  if (req.user && sameId(course.author as Types.ObjectId, req.user._id)) return;
  throw new HttpError(404, "Course not found");
};

const loadLessons = async (courseId: Types.ObjectId) =>
  CourseLesson.find({ courseId }).sort({ orderIndex: 1, _id: 1 }).lean();

const recalcLessonsCount = async (courseId: Types.ObjectId) => {
  const count = await CourseLesson.countDocuments({ courseId });
  await Course.updateOne({ _id: courseId }, { $set: { lessonsCount: count } });
  return count;
};

const computeProgressPercent = (completed: number, total: number) =>
  total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

export const listCourseCategories = async (_req: Request, res: Response) => {
  const categories = await CourseCategory.find({}).sort({ name: 1 }).lean();
  res.json({
    categories: categories.map((c) => ({
      id: c._id.toString(),
      name: c.name,
      slug: c.slug,
      description: c.description,
      icon: c.icon,
      color: c.color
    }))
  });
};

export const listCourses = async (req: Request, res: Response) => {
  const { limit, cursor } = parsePagination(req.query, 10, 50);
  const { search, category, difficulty, featured, enrolled } = req.query as Record<string, string | undefined>;
  const baseFilter: Record<string, unknown> = { ...buildCursorFilter(cursor) };
  if (category) baseFilter.category = category.toLowerCase();
  if (difficulty) baseFilter.difficulty = difficulty;
  if (featured !== undefined) baseFilter.isFeatured = featured === "true" || featured === "1";
  if (search) baseFilter.$text = { $search: search };

  const filters: Record<string, unknown>[] = [visibilityFilter(req), baseFilter];

  if (enrolled !== undefined) {
    if (!req.user) throw new HttpError(401, "Authentication required");
    const enrollments = await CourseEnrollment.find({ userId: req.user._id }, "courseId").lean();
    const ids = enrollments.map((e) => e.courseId);
    if (!ids.length) {
      res.json({ items: [], nextCursor: null });
      return;
    }
    filters.push({ _id: { $in: ids } });
  }

  const filter = { $and: filters };

  const courses = await Course.find(filter)
    .sort({ isFeatured: -1, createdAt: -1 })
    .limit(limit)
    .populate("author", authorProjection)
    .lean();

  res.json({
    items: courses.map((course) => serializeCourse(course as any)),
    nextCursor: getNextCursor(courses as any, limit)
  });
};

export const featuredCourses = async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 6, 12);
  const filter = { ...visibilityFilter(req), isFeatured: true, isPublished: true };
  const courses = await Course.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("author", authorProjection)
    .lean();
  res.json({ items: courses.map((c) => serializeCourse(c as any)) });
};

export const getCourseBySlug = async (req: Request, res: Response) => {
  const course = await Course.findOne({ slug: req.params.slug }).populate("author", authorProjection).lean();
  if (!course) throw new HttpError(404, "Course not found");
  assertCourseViewable(course, req);
  const lessons = await loadLessons(new Types.ObjectId(course._id));
  res.json({ course: serializeCourse({ ...course, lessons } as any, { includeLessons: true }) });
};

export const getCourseLessons = async (req: Request, res: Response) => {
  ensureObjectId(req.params.id);
  const course = await Course.findById(req.params.id).lean();
  if (!course) throw new HttpError(404, "Course not found");
  assertCourseViewable(course, req);
  const lessons = await loadLessons(course._id as Types.ObjectId);
  res.json({ lessons: lessons.map((l) => serializeCourseLesson(l as any)) });
};

export const createCourse = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  if (!hasLevelSeven(req.user) && !canModerateRole(userRole(req))) {
    throw new HttpError(403, "Only level 7 users or moderators/admins can create courses");
  }
  const {
    title,
    description,
    content,
    thumbnail,
    category,
    difficulty,
    durationMinutes,
    lessonsCount,
    isPublished,
    isFeatured
  } = req.body;

  const slug = slugify(title);
  const exists = await Course.exists({ slug });
  if (exists) throw new HttpError(409, "Course slug already exists");

  const canFeature = canModerateRole(userRole(req));
  const course = await Course.create({
    author: req.user._id,
    authorName: req.user.displayName || req.user.username,
    authorAvatar: req.user.avatar,
    title,
    slug,
    description,
    content,
    thumbnail,
    category: category.toLowerCase(),
    difficulty,
    durationMinutes: durationMinutes ?? 0,
    lessonsCount: lessonsCount ?? 0,
    enrolledCount: 0,
    isPublished: Boolean(isPublished),
    isFeatured: canFeature && Boolean(isFeatured)
  });

  await course.populate("author", authorProjection);
  res.status(201).json({ course: serializeCourse(course.toObject() as any) });
};

export const updateCourse = async (req: Request, res: Response) => {
  ensureObjectId(req.params.id, "Invalid course id");
  const course = await Course.findById(req.params.id);
  if (!course) throw new HttpError(404, "Course not found");
  if (!req.user) throw new HttpError(401, "Authentication required");
  const isAuthor = sameId(course.author as Types.ObjectId, req.user._id);
  if ((!isAuthor || !hasLevelSeven(req.user)) && !canModerateRole(userRole(req))) {
    throw new HttpError(403, "Only level 7 authors or moderators/admins can update courses");
  }

  const canFeature = canModerateRole(userRole(req));
  const updatable: Partial<typeof course> = {};
  const { title, description, content, thumbnail, category, difficulty, durationMinutes, lessonsCount, isPublished, isFeatured } =
    req.body;

  if (title !== undefined) {
    updatable.title = title;
  }
  if (description !== undefined) updatable.description = description;
  if (content !== undefined) updatable.content = content;
  if (thumbnail !== undefined) updatable.thumbnail = thumbnail;
  if (category !== undefined) updatable.category = category.toLowerCase();
  if (difficulty !== undefined) updatable.difficulty = difficulty;
  if (durationMinutes !== undefined) updatable.durationMinutes = durationMinutes;
  if (lessonsCount !== undefined) updatable.lessonsCount = lessonsCount;
  if (isPublished !== undefined) updatable.isPublished = isPublished;
  if (isFeatured !== undefined) {
    if (!canFeature) throw new HttpError(403, "Only moderators or admins can feature courses");
    updatable.isFeatured = isFeatured;
  }

  Object.assign(course, updatable);
  await course.save();
  await course.populate("author", authorProjection);
  res.json({ course: serializeCourse(course.toObject() as any) });
};

export const deleteCourse = async (req: Request, res: Response) => {
  ensureObjectId(req.params.id, "Invalid course id");
  const course = await Course.findById(req.params.id);
  if (!course) throw new HttpError(404, "Course not found");
  if (!req.user) throw new HttpError(401, "Authentication required");
  const isAuthor = sameId(course.author as Types.ObjectId, req.user._id);
  if ((!isAuthor || !hasLevelSeven(req.user)) && !canModerateRole(userRole(req))) {
    throw new HttpError(403, "Only level 7 authors or moderators/admins can delete courses");
  }

  await Promise.all([
    CourseLesson.deleteMany({ courseId: course._id }),
    CourseEnrollment.deleteMany({ courseId: course._id }),
    CourseProgress.deleteMany({ courseId: course._id })
  ]);
  await course.deleteOne();
  res.json({ message: "Course deleted" });
};

export const enrollCourse = async (req: Request, res: Response) => {
  ensureObjectId(req.params.id, "Invalid course id");
  if (!req.user) throw new HttpError(401, "Authentication required");
  const course = await Course.findById(req.params.id);
  if (!course) throw new HttpError(404, "Course not found");
  assertCourseViewable(course, req);

  const existing = await CourseEnrollment.findOne({ courseId: course._id, userId: req.user._id });
  if (existing) {
    res.status(200).json({ enrolledAt: existing.enrolledAt });
    return;
  }

  await CourseEnrollment.create({ courseId: course._id, userId: req.user._id });
  await Course.updateOne({ _id: course._id }, { $inc: { enrolledCount: 1 } });
  res.status(201).json({ enrolledAt: new Date() });
};

export const unenrollCourse = async (req: Request, res: Response) => {
  ensureObjectId(req.params.id, "Invalid course id");
  if (!req.user) throw new HttpError(401, "Authentication required");
  const course = await Course.findById(req.params.id);
  if (!course) throw new HttpError(404, "Course not found");
  assertCourseViewable(course, req);

  const result = await CourseEnrollment.deleteOne({ courseId: course._id, userId: req.user._id });
  if (result.deletedCount) {
    await Course.updateOne(
      { _id: course._id, enrolledCount: { $gt: 0 } },
      { $inc: { enrolledCount: -1 } }
    );
  }
  res.json({ message: "Unenrolled" });
};

export const createLesson = async (req: Request, res: Response) => {
  ensureObjectId(req.params.id, "Invalid course id");
  if (!req.user) throw new HttpError(401, "Authentication required");
  const course = await Course.findById(req.params.id);
  if (!course) throw new HttpError(404, "Course not found");
  const isAuthor = sameId(course.author as Types.ObjectId, req.user._id);
  if ((!isAuthor || !hasLevelSeven(req.user)) && !canModerateRole(userRole(req))) {
    throw new HttpError(403, "Only level 7 authors or moderators/admins can manage lessons");
  }

  const { title, content, videoUrl, durationMinutes, orderIndex, isFree } = req.body;
  const targetOrder =
    typeof orderIndex === "number"
      ? orderIndex
      : await CourseLesson.countDocuments({ courseId: course._id });

  const lesson = await CourseLesson.create({
    courseId: course._id,
    title,
    content,
    videoUrl,
    durationMinutes: durationMinutes ?? 0,
    orderIndex: targetOrder,
    isFree: Boolean(isFree)
  });

  await recalcLessonsCount(course._id as Types.ObjectId);

  res.status(201).json({ lesson: serializeCourseLesson(lesson.toObject() as any) });
};

export const updateLesson = async (req: Request, res: Response) => {
  ensureObjectId(req.params.id, "Invalid course id");
  ensureObjectId(req.params.lessonId, "Invalid lesson id");
  if (!req.user) throw new HttpError(401, "Authentication required");

  const course = await Course.findById(req.params.id);
  if (!course) throw new HttpError(404, "Course not found");
  const isAuthor = sameId(course.author as Types.ObjectId, req.user._id);
  if ((!isAuthor || !hasLevelSeven(req.user)) && !canModerateRole(userRole(req))) {
    throw new HttpError(403, "Only level 7 authors or moderators/admins can manage lessons");
  }

  const lesson = await CourseLesson.findOne({ _id: req.params.lessonId, courseId: course._id });
  if (!lesson) throw new HttpError(404, "Lesson not found");

  const { title, content, videoUrl, durationMinutes, orderIndex, isFree } = req.body;
  if (title !== undefined) lesson.title = title;
  if (content !== undefined) lesson.content = content;
  if (videoUrl !== undefined) lesson.videoUrl = videoUrl;
  if (durationMinutes !== undefined) lesson.durationMinutes = durationMinutes;
  if (orderIndex !== undefined) lesson.orderIndex = orderIndex;
  if (isFree !== undefined) lesson.isFree = isFree;

  await lesson.save();
  res.json({ lesson: serializeCourseLesson(lesson.toObject() as any) });
};

export const deleteLesson = async (req: Request, res: Response) => {
  ensureObjectId(req.params.id, "Invalid course id");
  ensureObjectId(req.params.lessonId, "Invalid lesson id");
  if (!req.user) throw new HttpError(401, "Authentication required");

  const course = await Course.findById(req.params.id);
  if (!course) throw new HttpError(404, "Course not found");
  const isAuthor = sameId(course.author as Types.ObjectId, req.user._id);
  if ((!isAuthor || !hasLevelSeven(req.user)) && !canModerateRole(userRole(req))) {
    throw new HttpError(403, "Only level 7 authors or moderators/admins can manage lessons");
  }

  const lesson = await CourseLesson.findOne({ _id: req.params.lessonId, courseId: course._id });
  if (!lesson) throw new HttpError(404, "Lesson not found");

  await lesson.deleteOne();
  await recalcLessonsCount(course._id as Types.ObjectId);
  res.json({ message: "Lesson deleted" });
};

export const getCourseProgress = async (req: Request, res: Response) => {
  ensureObjectId(req.params.id, "Invalid course id");
  if (!req.user) throw new HttpError(401, "Authentication required");
  const course = await Course.findById(req.params.id).lean();
  if (!course) throw new HttpError(404, "Course not found");
  assertCourseViewable(course, req);

  let progress = await CourseProgress.findOne({ courseId: course._id, userId: req.user._id });
  if (!progress) {
    progress = await CourseProgress.create({
      courseId: course._id,
      userId: req.user._id,
      completedLessons: [],
      progressPercent: 0,
      startedAt: new Date(),
      lastAccessedAt: new Date()
    });
  } else {
    progress.lastAccessedAt = new Date();
    await progress.save();
  }

  res.json({ progress: serializeCourseProgress(progress.toObject() as any, course as any) });
};

export const completeLesson = async (req: Request, res: Response) => {
  ensureObjectId(req.params.id, "Invalid course id");
  ensureObjectId(req.params.lessonId, "Invalid lesson id");
  if (!req.user) throw new HttpError(401, "Authentication required");

  const course = await Course.findById(req.params.id);
  if (!course) throw new HttpError(404, "Course not found");
  assertCourseViewable(course, req);

  const lesson = await CourseLesson.findOne({ _id: req.params.lessonId, courseId: course._id });
  if (!lesson) throw new HttpError(404, "Lesson not found");

  let progress = await CourseProgress.findOne({ courseId: course._id, userId: req.user._id });
  if (!progress) {
    progress = await CourseProgress.create({
      courseId: course._id,
      userId: req.user._id,
      completedLessons: [],
      progressPercent: 0,
      startedAt: new Date(),
      lastAccessedAt: new Date()
    });
  }

  const completed = progress.completedLessons as unknown as Types.Array<Types.ObjectId>;
  completed.addToSet(lesson._id);
  const percent = computeProgressPercent(completed.length, course.lessonsCount ?? 0);
  progress.progressPercent = percent;
  progress.lastAccessedAt = new Date();
  if (percent === 100 && !progress.completedAt) progress.completedAt = new Date();
  await progress.save();

  res.json({ progress: serializeCourseProgress(progress.toObject() as any, course.toObject() as any) });
};

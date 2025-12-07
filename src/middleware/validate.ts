import { NextFunction, Request, Response } from "express";
import { AnyZodObject, ZodError } from "zod";
import { HttpError } from "./error";

export const validate =
  (schema: AnyZodObject) => async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params
      });
      req.body = parsed.body ?? req.body;
      req.query = parsed.query ?? req.query;
      req.params = parsed.params ?? req.params;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const message = err.issues.map((issue) => issue.message).join(", ");
        next(new HttpError(400, message));
        return;
      }
      next(err);
    }
  };

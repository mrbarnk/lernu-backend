import { Request, Response } from "express";
import { HttpError } from "../middleware/error";
import { generateScriptWithAi, generateVideoFromScript } from "../services/projectAiService";

export const generateScript = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { prompt, language, duration } = req.body as {
    prompt: string;
    language: string;
    duration: string;
  };

  const result = await generateScriptWithAi({ prompt, language, duration });
  res.json({ script: result.script, usage: result.usage });
};

export const generateVideoFromScriptHandler = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { script, style } = req.body as { script: string; style?: any };

  const result = await generateVideoFromScript({ script, style });
  res.status(result.statusCode ?? 200).json(result.payload);
};

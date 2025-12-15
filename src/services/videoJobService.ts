import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env";
import { VideoSequence } from "../models/VideoGeneration";

const audioModel = "gemini-2.5-flash-preview";
const imageModel = "imagen-4.0-fast-generate-001";
const client = env.geminiApiKey ? new GoogleGenAI({ apiKey: env.geminiApiKey }) : null;

const requireClient = () => {
  if (!client) throw new Error("Gemini API key is not configured");
  return client;
};

const toDataUri = (base64: string, mime: string) => `data:${mime};base64,${base64}`;

const generateAudioDataUri = async (sequence: VideoSequence) => {
  const model = requireClient();
  const result = await model.models.generateContent({
    model: audioModel,
    contents: [{ role: "user", parts: [{ text: sequence.audio }] }],
    config: { responseMimeType: "audio/mp3" }
  });

  const audioPart =
    result.candidates?.[0]?.content?.parts?.find(
      (part: any) => part.inlineData?.data && part.inlineData?.mimeType?.startsWith("audio/")
    );

  const base64 = audioPart?.inlineData?.data;
  const mime = audioPart?.inlineData?.mimeType ?? "audio/mp3";
  if (!base64) throw new Error("No audio returned from Gemini");
  return toDataUri(base64, mime);
};

const generateImageDataUri = async (sequence: VideoSequence) => {
  const prompt = sequence.imagePrompt || sequence.bRollPrompt || sequence.audio;
  const model = requireClient();
  const result = await model.models.generateImages({
    model: imageModel,
    prompt
  });

  const first = result.generatedImages?.[0] as any;
  const image = first?.inlineData?.data || first?.bytesBase64Encoded;
  const mime = first?.inlineData?.mimeType || first?.mimeType || "image/png";

  if (!image) throw new Error("No image returned from Gemini");
  return toDataUri(image, mime);
};

export const processVideoGenerationJob = async (video: any) => {
  try {
    video.status = "processing";
    video.progress = 0;
    await video.save();

    const total = video.sequences.length || 1;
    const updatedSequences: VideoSequence[] = [];

    for (let idx = 0; idx < video.sequences.length; idx += 1) {
      const seq = video.sequences[idx] as VideoSequence;
      const [audioDataUri, imageDataUri] = await Promise.all([
        generateAudioDataUri(seq),
        generateImageDataUri(seq)
      ]);
      updatedSequences.push({
        ...seq,
        audioDataUri,
        imageDataUri
      });

      video.progress = Math.round(((idx + 1) / total) * 100);
      await video.save();
    }

    video.sequences = updatedSequences;
    video.status = "completed";
    video.progress = 100;
    await video.save();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Video generation job failed", err);
    video.status = "failed";
    await video.save();
    throw err;
  }
};

export const getVideoGenerationStatus = async (video: any) => ({
  id: video._id.toString(),
  status: video.status ?? "pending",
  progress: video.progress ?? 0,
  videoUri: video.videoUri ?? null
});

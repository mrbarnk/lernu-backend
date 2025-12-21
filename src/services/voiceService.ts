import { env } from "../config/env";
import { HttpError } from "../middleware/error";

const ELEVEN_BASE_URL = "https://api.elevenlabs.io/v1/text-to-speech";

const VOICE_ID_MAP: Record<string, string> = {
  "narrator-deep": "narrator-deep",
  "narrator-warm": "narrator-warm",
  "storyteller-f": "storyteller-f",
  "storyteller-m": "storyteller-m",
  "dramatic-f": "dramatic-f",
  "mysterious": "mysterious",
  "upbeat-f": "upbeat-f",
  "classic-m": "classic-m"
};

const pickVoiceId = (voiceId?: string) => {
  if (!voiceId) return VOICE_ID_MAP["narrator-deep"];
  return VOICE_ID_MAP[voiceId] ?? VOICE_ID_MAP["narrator-deep"];
};

export const elevenLabsAvailable = () => Boolean(env.elevenLabsApiKey);

export const synthesizeVoice = async (params: {
  text: string;
  voiceId?: string;
  modelId?: string;
}): Promise<{ audioDataUri: string }> => {
  const apiKey = env.elevenLabsApiKey;
  if (!apiKey) throw new HttpError(500, "ElevenLabs API key is not configured");

  const voice = pickVoiceId(params.voiceId);
  const modelId = params.modelId ?? env.elevenLabsModelId ?? "eleven_multilingual_v2";

  const resp = await fetch(`${ELEVEN_BASE_URL}/${voice}/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey
    },
    body: JSON.stringify({
      text: params.text,
      model_id: modelId,
      voice_settings: {
        stability: 0.3,
        similarity_boost: 0.7,
        style: 0.4
      }
    })
  });

  if (!resp.ok) {
    const message = `ElevenLabs TTS failed (${resp.status})`;
    throw new HttpError(500, message);
  }

  const arrayBuffer = await resp.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString("base64");
  const mime = resp.headers.get("content-type") || "audio/mpeg";
  return { audioDataUri: `data:${mime};base64,${base64}` };
};

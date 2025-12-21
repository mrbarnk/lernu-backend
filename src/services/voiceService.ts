import { env } from "../config/env";
import { HttpError } from "../middleware/error";

const ELEVEN_TTS_BASE_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const ELEVEN_VOICES_BASE_URL = "https://api.elevenlabs.io/v1/voices";

// Map UI voice ids to actual ElevenLabs voice ids (public sample voices)
const VOICE_ID_MAP: Record<string, string> = {
  "narrator-deep": "ErXwobaYiN019PkySvjV",     // Antoni
  "narrator-warm": "21m00Tcm4TlvDq8ikWAM",     // Rachel
  "storyteller-f": "EXAVITQu4vr4xnSDxMaL",     // Bella
  "storyteller-m": "TxGEqnHWrfWFTfGW9XjX",     // Josh
  "dramatic-f": "MF3mGyEYCl7XYWbV9V6O",        // Elli
  "mysterious": "VR6AewLTigWG4xSOukaG",        // Arnold
  "upbeat-f": "AZnzlk1XvdvUeBnXmlld",          // Domi
  "classic-m": "pNInz6obpgDQGcFmaJgB"          // Adam
};

const isElevenVoiceId = (voiceId?: string) => Boolean(voiceId && /^[A-Za-z0-9]{20,}$/.test(voiceId));

const pickVoiceId = (voiceId?: string) => {
  if (!voiceId) return VOICE_ID_MAP["narrator-deep"];
  if (isElevenVoiceId(voiceId)) return voiceId;
  return VOICE_ID_MAP[voiceId] ?? VOICE_ID_MAP["narrator-deep"];
};

export type ElevenVoiceOption = {
  id: string;
  name: string;
  gender?: string;
  style?: string;
  previewUrl?: string;
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

  const resp = await fetch(`${ELEVEN_TTS_BASE_URL}/${voice}/stream`, {
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

export const fetchVoicePreviewUrl = async (uiVoiceId: string): Promise<string | null> => {
  const apiKey = env.elevenLabsApiKey;
  if (!apiKey) return null;

  const resolvedId = isElevenVoiceId(uiVoiceId) ? uiVoiceId : VOICE_ID_MAP[uiVoiceId];
  if (!resolvedId) return null;

  const resp = await fetch(`${ELEVEN_VOICES_BASE_URL}/${resolvedId}`, {
    headers: { "xi-api-key": apiKey }
  });

  if (!resp.ok) {
    return null;
  }

  const data = (await resp.json()) as { preview_url?: string };
  return data.preview_url ?? null;
};

export const fetchElevenLabsVoices = async (): Promise<ElevenVoiceOption[]> => {
  const apiKey = env.elevenLabsApiKey;
  if (!apiKey) return [];

  const resp = await fetch(ELEVEN_VOICES_BASE_URL, {
    headers: { "xi-api-key": apiKey }
  });

  if (!resp.ok) return [];
  const data = (await resp.json()) as { voices?: any[] };
  const voices = data.voices || [];

  return voices.map((voice) => ({
    id: voice.voice_id,
    name: voice.name,
    gender: voice?.labels?.gender,
    style: voice?.description,
    previewUrl: voice.preview_url
  }));
};

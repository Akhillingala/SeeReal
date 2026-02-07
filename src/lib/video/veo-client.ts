/**
 * CReal - Veo video generation client (REST)
 * Generates short (<15s) clips via Google Veo 3.1 using the Gemini API.
 * Uses 6-second duration for a quick, focused summary clip.
 */

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = 'veo-3.1-generate-preview';
const POLL_INTERVAL_MS = 8000;
const MAX_POLL_ATTEMPTS = 30; // ~4 minutes max

export interface VeoGenerateResult {
  videoBase64: string;
  mimeType: string;
}

function authHeaders(apiKey: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
  };
}

/**
 * Start a long-running video generation job. Returns operation name.
 */
async function startGeneration(
  apiKey: string,
  prompt: string
): Promise<string> {
  const url = `${BASE_URL}/models/${MODEL}:predictLongRunning`;
  const body = {
    instances: [{ prompt }],
    parameters: {
      durationSeconds: '6',
      aspectRatio: '16:9',
      resolution: '720p',
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Veo start failed: ${res.status} ${errText}`);
  }
  const data = (await res.json()) as { name?: string };
  const name = data?.name;
  if (!name || typeof name !== 'string') {
    throw new Error('Veo start: missing operation name in response');
  }
  return name;
}

/**
 * Poll operation until done. Returns the raw operation response when done.
 */
async function pollOperation(
  apiKey: string,
  operationName: string
): Promise<Record<string, unknown>> {
  const url = operationName.startsWith('http')
    ? operationName
    : `${BASE_URL}/${operationName}`;
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const res = await fetch(url, {
      method: 'GET',
      headers: authHeaders(apiKey),
    });
    if (!res.ok) {
      throw new Error(`Veo poll failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { done?: boolean; error?: { message?: string }; response?: Record<string, unknown> };
    if (data.error?.message) {
      throw new Error(`Veo error: ${data.error.message}`);
    }
    if (data.done) {
      return (data.response as Record<string, unknown>) ?? {};
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error('Veo generation timed out');
}

/**
 * Extract video URI from operation response and download video bytes.
 * Response path from docs: response.generateVideoResponse.generatedSamples[0].video.uri
 */
function getVideoUri(response: Record<string, unknown>): string | null {
  const gen = response?.generateVideoResponse as Record<string, unknown> | undefined;
  const samples = gen?.generatedSamples as unknown[] | undefined;
  const first = samples?.[0] as Record<string, unknown> | undefined;
  const video = first?.video as Record<string, unknown> | undefined;
  const uri = video?.uri;
  return typeof uri === 'string' ? uri : null;
}

/**
 * Download video from URI (with API key for auth) and return as base64.
 */
async function downloadVideo(apiKey: string, uri: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(uri, {
    headers: { 'x-goog-api-key': apiKey },
  });
  if (!res.ok) {
    throw new Error(`Veo download failed: ${res.status}`);
  }
  const blob = await res.blob();
  const mimeType = blob.type || 'video/mp4';
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = typeof btoa !== 'undefined' ? btoa(binary) : Buffer.from(bytes).toString('base64');
  return { base64, mimeType };
}

/**
 * Generate a short (6 second) video from a text prompt. Returns base64-encoded video.
 */
export async function generateVideo(
  apiKey: string,
  prompt: string
): Promise<VeoGenerateResult> {
  const operationName = await startGeneration(apiKey, prompt);
  const response = await pollOperation(apiKey, operationName);
  const uri = getVideoUri(response);
  if (!uri) {
    throw new Error('Veo response missing video URI');
  }
  const { base64, mimeType } = await downloadVideo(apiKey, uri);
  return { videoBase64: base64, mimeType };
}

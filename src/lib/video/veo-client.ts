/**
 * SeeReal - Veo video generation client (REST)
 * Generates short (<15s) clips via Google Veo 3.1 using the Gemini API.
 * Uses 8-second duration for an infographic/news-cartoon style explainer.
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
      durationSeconds: 8,
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
 * Extract video URI from operation response.
 * Uses a recursive search to find any property that looks like a video URI.
 */
export function getVideoUri(response: Record<string, unknown>): string | null {
  if (!response || typeof response !== 'object') return null;

  // Debug: Log the full response structure
  console.log('[SeeReal Veo] Full response:', JSON.stringify(response, null, 2));

  // Helper: check if a value is a valid video URI
  const isVideoUri = (val: unknown): val is string => {
    if (typeof val !== 'string') return false;
    return val.startsWith('https://') && (
      val.includes('.mp4') ||
      val.includes('googlevideo.com') ||
      val.includes('generativelanguage.googleapis.com')
    );
  };

  // Helper: recursive search
  const findUri = (obj: unknown, depth = 0): string | null => {
    if (depth > 5 || !obj || typeof obj !== 'object') return null;

    // 1. Check current object for direct URI candidate
    if ('uri' in obj && isVideoUri((obj as any).uri)) {
      return (obj as any).uri;
    }
    if ('videoUri' in obj && isVideoUri((obj as any).videoUri)) {
      return (obj as any).videoUri;
    }

    // 2. Check if this object IS the video object (has uri property but maybe not strictly valid check yet?)
    // Let's rely on strict check above first.

    // 3. Iterate keys
    for (const key of Object.keys(obj)) {
      const val = (obj as any)[key];

      // If array, search elements
      if (Array.isArray(val)) {
        for (const item of val) {
          const found = findUri(item, depth + 1);
          if (found) return found;
        }
      }
      // If object, search recursively
      else if (typeof val === 'object') {
        const found = findUri(val, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };

  // Special case: check top-level known paths first for speed/correctness
  // Path 1: generateVideoResponse.generatedSamples[0].video.uri
  const gen = response.generateVideoResponse as any;
  if (gen?.generatedSamples?.[0]?.video?.uri) return gen.generatedSamples[0].video.uri;
  if (gen?.generated_samples?.[0]?.video?.uri) return gen.generated_samples[0].video.uri;

  // Path 2: generatedVideos[0].video.uri
  const genVideos = response.generatedVideos as any;
  if (genVideos?.[0]?.video?.uri) return genVideos[0].video.uri;

  // Path 3: videos[0].uri
  const videos = response.videos as any;
  if (videos?.[0]?.uri) return videos[0].uri;

  // Fallback: Deep recursive search
  console.log('[SeeReal Veo] Standard paths failed. Starting deep recursive search...');
  return findUri(response);
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
 * Generate an 8-second infographic-style video from a text prompt. Returns base64-encoded video.
 */
export async function generateVideo(
  apiKey: string,
  prompt: string
): Promise<VeoGenerateResult> {
  const operationName = await startGeneration(apiKey, prompt);
  const response = await pollOperation(apiKey, operationName);
  const uri = getVideoUri(response);
  if (!uri) {
    const keys = response && typeof response === 'object' ? Object.keys(response).join(', ') : 'empty';
    throw new Error(`Veo response missing video URI. Response keys: ${keys || '(none)'}`);
  }
  // gs:// URIs require GCS auth; only https is supported for direct fetch
  if (uri.startsWith('gs://')) {
    throw new Error(
      'Veo returned a Cloud Storage URI (gs://). This extension only supports direct download URLs. Try using Google AI Studio / Gemini API with a key that returns https URLs, or use Vertex AI with a GCS bucket and download the file separately.'
    );
  }
  const { base64, mimeType } = await downloadVideo(apiKey, uri);
  return { videoBase64: base64, mimeType };
}

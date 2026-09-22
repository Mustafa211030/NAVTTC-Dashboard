export const maxDuration = 30;

export async function POST(req: Request) {
  const formData = await req.formData().catch(() => null);
  const audio = formData?.get("audio");
  if (!(audio instanceof File)) return new Response("No audio provided", { status: 400 });

  const upstream = new FormData();
  upstream.append("file", audio, "audio.webm");
  upstream.append("model", "whisper-large-v3-turbo");
  upstream.append("response_format", "json");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: upstream,
  });

  if (!res.ok) {
    console.error("Transcription failed:", await res.text());
    return new Response("Transcription failed", { status: 502 });
  }

  const data = await res.json();
  return Response.json({ text: (data.text ?? "").trim() });
}
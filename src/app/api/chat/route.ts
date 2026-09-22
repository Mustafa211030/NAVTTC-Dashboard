import { groq } from "@ai-sdk/groq";
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from "ai";
import { buildTools, buildSystemPrompt, filtersSchema } from "@/lib/chat-tools";
import { EMPTY_FILTERS } from "@/lib/filters";

export const maxDuration = 30;

const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 20; // Groq's free RPM is much higher than Gemini's, so this can loosen too
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
  if (limited(ip)) return new Response("Too many requests. Please wait a minute.", { status: 429 });

  const body = await req.json().catch(() => null);
  const messages: UIMessage[] | undefined = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) return new Response("Bad request", { status: 400 });

  const parsed = filtersSchema.safeParse(body.filters);
  const filters = parsed.success ? parsed.data : EMPTY_FILTERS;

  const result = streamText({
    model: groq(process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile"),
    system: buildSystemPrompt(filters),
    messages: await convertToModelMessages(messages.slice(-10)),
    tools: buildTools(filters),
    stopWhen: stepCountIs(6),
    temperature: 0.2,
    abortSignal: req.signal,
  });

  return result.toUIMessageStreamResponse({
    onError: (e) => {
      console.error(e);
      const m = String((e as { message?: string })?.message ?? e);
      return /429|rate.?limit/i.test(m)
        ? "Free-tier rate limit reached. Wait about a minute and try again."
        : "Something went wrong reaching the AI service.";
    },
  });
}
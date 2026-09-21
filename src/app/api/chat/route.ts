import { google } from "@ai-sdk/google";
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from "ai";
import { buildTools, buildSystemPrompt, filtersSchema } from "@/lib/chat-tools";
import { EMPTY_FILTERS } from "@/lib/filters";

export const maxDuration = 30;

// Light per-IP throttle. In-memory, so it is best-effort on serverless.
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 8;
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
    model: google(process.env.GEMINI_MODEL ?? "gemini-2.5-flash"),
    system: buildSystemPrompt(filters),
    messages: await convertToModelMessages(messages.slice(-10)), // keep token use low on the free tier
    tools: buildTools(filters),
    stopWhen: stepCountIs(6),
    temperature: 0.2,
    abortSignal: req.signal,
  });

  return result.toUIMessageStreamResponse({
    onError: (e) => {
      console.error(e);
      const m = String((e as { message?: string })?.message ?? e);
      return /429|quota|rate/i.test(m)
        ? "Free-tier rate limit reached. Wait about a minute and try again."
        : "Something went wrong reaching the AI service.";
    },
  });
}
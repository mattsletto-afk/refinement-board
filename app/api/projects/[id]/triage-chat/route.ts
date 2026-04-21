import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

const SYSTEM = `You are a product management assistant helping classify backlog items.

The three levels are:
- **Epic**: A large body of work spanning multiple sprints, representing a major capability or theme (e.g. "Payments", "Onboarding", "Reporting"). Epics contain features and stories.
- **Feature**: A meaningful, shippable slice of an epic — something a user or team can point to as done. Usually 1-4 weeks of work. Contains user stories.
- **User Story**: A single, testable unit of value from a user's perspective. Follows "As a [user], I want [action] so that [outcome]". Should be completable in a sprint.

When helping the user decide, ask clarifying questions about scope, complexity, and user impact. Be concise. After discussing, give a clear recommendation with a one-sentence rationale.`

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await params
  const { item, messages } = await req.json() as {
    item: { title: string; userStory?: string; notes?: string }
    messages: { role: 'user' | 'assistant'; content: string }[]
  }

  const itemContext = [
    `Title: ${item.title}`,
    item.userStory ? `Description: ${item.userStory}` : '',
    item.notes ? `Notes: ${item.notes}` : '',
  ].filter(Boolean).join('\n')

  const systemWithItem = `${SYSTEM}\n\nCurrent item being triaged:\n${itemContext}`

  const stream = await client.messages.stream({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: systemWithItem,
    messages,
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          controller.enqueue(encoder.encode(event.delta.text))
        }
      }
      controller.close()
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

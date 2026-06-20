import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

export async function generateResponse(
  commentText: string,
  authorName: string,
  accountName: string,
  tone: string = 'professional',
  rules: string[] = []
): Promise<string> {
  const rulesText = rules.length > 0 ? `\nRules:\n${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}` : '';

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: `You are a social media manager for "${accountName}". Generate a ${tone} reply to this Facebook comment.

Comment by ${authorName}: "${commentText}"
${rulesText}

Requirements:
- Keep it concise (1-3 sentences max)
- Match the ${tone} tone
- Be helpful and engaging
- No hashtags unless relevant
- Reply in the same language as the comment

Reply only with the response text, no quotes or explanation.`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response type from Claude');
  return content.text;
}

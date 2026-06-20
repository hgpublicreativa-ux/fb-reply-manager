import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateResponse(
  commentText: string,
  authorName: string,
  accountName: string,
  tone: string = 'professional',
  rules: string[] = []
): Promise<string> {
  const rulesText = rules.length > 0
    ? `\nRules:\n${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
    : '';

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 500,
    messages: [
      {
        role: 'system',
        content: `You are a social media manager for "${accountName}". Generate a ${tone} reply to Facebook comments. Keep replies concise (1-3 sentences), helpful, and engaging. Reply in the same language as the comment. No hashtags unless relevant.${rulesText}`,
      },
      {
        role: 'user',
        content: `Reply to this comment by ${authorName}: "${commentText}"\n\nReply only with the response text, no quotes or explanation.`,
      },
    ],
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error('No response from OpenAI');
  return text.trim();
}

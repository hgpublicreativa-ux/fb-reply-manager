import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Instrucciones de personalidad por tono (en español, pensado para farándula y política)
const TONE_PROFILES: Record<string, string> = {
  comedy:
    'Cordial pero MUY divertido. Humor de farándula y chisme: ironía ligera, comentarios ingeniosos, ocurrentes y chistosos, con exageración cómica y picardía sana. Tu objetivo es sacar una sonrisa o una carcajada. Juega con dobles sentidos suaves. Nunca insultes ni ofendas a nadie: la gracia va con cariño, no con maldad.',
  ironic:
    'Ingenioso y sarcástico con elegancia. Ironía fina, picante e inteligente, comedia de chispa rápida. Comentarios mordaces pero con clase. Sin groserías ni ataques personales: ironía sí, agresión no.',
  neutral:
    'Cordial, neutral y equilibrado. TEMA SENSIBLE/POLÍTICO: no tomes partido, no opines a favor ni en contra de ninguna figura, partido o ideología. Agradece la participación, mantén el respeto y la mesura, y evita cualquier afirmación polémica o que pueda interpretarse como una postura.',
  friendly: 'Cercano, cálido y amistoso, como hablándole a un amigo.',
  professional: 'Profesional, claro y respetuoso.',
  casual: 'Relajado e informal, lenguaje del día a día.',
  formal: 'Formal y educado, con un registro cuidado.',
  empathetic: 'Empático y comprensivo, con calidez y cercanía.',
};

export async function generateResponse(
  commentText: string,
  authorName: string,
  accountName: string,
  tone: string = 'comedy',
  rules: string[] = []
): Promise<string> {
  const toneInstructions = TONE_PROFILES[tone] || TONE_PROFILES.comedy;

  const rulesText =
    rules.length > 0
      ? `\nReglas personalizadas de esta página (respétalas siempre):\n${rules
          .map((r, i) => `${i + 1}. ${r}`)
          .join('\n')}`
      : '';

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 300,
    temperature: 0.9,
    messages: [
      {
        role: 'system',
        content: `Eres el community manager de la página "${accountName}". Respondes comentarios de seguidores en redes sociales.

ESTILO: ${toneInstructions}

Reglas generales:
- Responde SIEMPRE en el mismo idioma del comentario (normalmente español).
- Muy corto: 1 o 2 frases como máximo.
- Cordial y cercano; jamás grosero, ofensivo ni discriminatorio.
- No insultes ni ataques a ninguna persona.
- No inventes datos ni afirmes cosas que no sabes.
- Puedes usar 1 o 2 emojis si encajan con el estilo.
- No uses hashtags salvo que aporten.${rulesText}`,
      },
      {
        role: 'user',
        content: `Comentario de ${authorName}: "${commentText}"\n\nResponde SOLO con el texto de la respuesta, sin comillas ni explicaciones.`,
      },
    ],
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error('No response from OpenAI');
  return text.trim();
}

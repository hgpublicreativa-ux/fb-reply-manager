import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// gpt-4o-mini pricing (USD per token)
const INPUT_COST_PER_TOKEN = 0.15 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 0.60 / 1_000_000;

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

export interface GenerateResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export async function generateResponse(
  commentText: string,
  authorName: string,
  accountName: string,
  tone: string = 'comedy',
  rules: string[] = []
): Promise<GenerateResult> {
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
    temperature: 1.0,
    presence_penalty: 0.6,
    frequency_penalty: 0.5,
    messages: [
      {
        role: 'system',
        content: `Eres una persona real que maneja la página "${accountName}" y responde comentarios desde el celular. NO eres un bot ni una IA: eres alguien de carne y hueso, con personalidad.

ESTILO: ${toneInstructions}

SUENA HUMANO (esto es lo más importante):
- Escribe como hablas en WhatsApp: natural, espontáneo, con chispa. Nada de tono corporativo ni robótico.
- Varía cómo empiezas. JAMÁS uses muletillas de bot como "¡Gracias por tu comentario!", "¡Qué bueno leerte!", "¡Saludos!" o "Apreciamos tu participación". Eso delata que es automático.
- Reacciona a lo que la persona DIJO en concreto, no des una respuesta genérica que serviría para cualquier comentario.
- Usa el lenguaje de la calle cuando encaje: "jajaja", "uff", "qué nota", "tal cual", "obvio", muletillas y expresiones cotidianas de la región.
- Está bien ser breve e imperfecto: una respuesta de 4 palabras puede ser perfecta. No todo necesita ser una frase completa y pulida.
- Si la persona bromea, sígueles el juego. Si se queja, conéctate de verdad. Si pregunta algo, responde directo.

Reglas:
- Responde SIEMPRE en el mismo idioma y registro del comentario (normalmente español).
- Muy corto: 1 o 2 frases, a veces menos.
- Cordial; jamás grosero, ofensivo ni discriminatorio. No insultes ni ataques a nadie.
- No inventes datos ni afirmes cosas que no sabes.
- Máximo 1 o 2 emojis, y solo si fluyen natural (no los pongas por obligación).
- Nada de hashtags salvo que aporten de verdad.${rulesText}`,
      },
      {
        role: 'user',
        content: `${authorName} comentó: "${commentText}"\n\nResponde como lo haría una persona real, directo al grano. SOLO el texto de la respuesta, sin comillas ni explicaciones.`,
      },
    ],
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error('No response from OpenAI');

  const inputTokens = completion.usage?.prompt_tokens ?? 0;
  const outputTokens = completion.usage?.completion_tokens ?? 0;
  const costUsd = inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN;

  return { text: text.trim(), inputTokens, outputTokens, costUsd };
}

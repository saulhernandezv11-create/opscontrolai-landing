// ============================================================
// shared/openai-client.ts – OpenAI API wrapper (direct API, not Azure)
// Replaces: Azure OpenAI endpoint → api.openai.com
// Model: gpt-4o-mini (much cheaper) – configurable via env
// ============================================================

import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { Tenant } from '../models/tenant';
import type { Message } from '../models/conversation';

// Use gpt-4o-mini by default: ~$0.15/1M input tokens (vs $2.50 for gpt-4o)
// Override with OPENAI_MODEL=gpt-4o in .env for higher quality
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_OUTPUT_TOKENS = 1000;
const HISTORY_WINDOW = 10;

// Approximate MXN costs for gpt-4o-mini
const MXN_COST_PER_1K_INPUT_TOKENS = 0.0026;   // ~$0.00015 USD * 17.5 MXN/USD
const MXN_COST_PER_1K_OUTPUT_TOKENS = 0.0105;  // ~$0.0006 USD * 17.5 MXN/USD

let _client: OpenAI | null = null;

function getClient(): OpenAI {
    if (_client) return _client;
    // Direct OpenAI API – no Azure-specific baseURL or headers needed
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    return _client;
}

export interface OpenAIResult {
    response: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostMXN: number;
}

function buildSystemPrompt(tenant: Tenant): string {
    const customResponseHints = Object.entries(tenant.customResponses || {})
        .map(([key, value]) => `- Si el usuario pregunta por "${key}", responde: "${value}"`)
        .join('\n');

    return tenant.systemPrompt ?? `Eres el asistente virtual de atención al cliente de "${tenant.branding.businessName}". 
Tu objetivo es ayudar a los clientes de manera eficiente, profesional y amigable.
Responde SIEMPRE en español mexicano informal pero respetuoso.
Mantén las respuestas concisas (máximo 3 párrafos).
Si no sabes la respuesta a algo específico, ofrece conectar al cliente con un agente humano.
Nunca inventes información sobre precios, horarios o políticas del negocio.

${customResponseHints ? `Respuestas configuradas:\n${customResponseHints}` : ''}

Si detectas que el cliente está molesto o frustrado, prioriza empatía antes de dar información.
No uses emojis en exceso – máximo 1-2 por mensaje.`;
}

function buildMessageHistory(messages: Message[]): ChatCompletionMessageParam[] {
    return messages
        .slice(-HISTORY_WINDOW)
        .filter((m) => m.type === 'text' && m.content)
        .map((m) => ({
            role: m.direction === 'inbound' ? 'user' : 'assistant',
            content: m.content,
        }));
}

export async function generateResponse(
    tenant: Tenant,
    conversationHistory: Message[],
    userMessage: string,
): Promise<OpenAIResult> {
    const client = getClient();
    const systemPrompt = buildSystemPrompt(tenant);
    const history = buildMessageHistory(conversationHistory);

    const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userMessage },
    ];

    const completion = await client.chat.completions.create({
        model: MODEL,
        messages,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.7,
        frequency_penalty: 0.3,
        presence_penalty: 0.1,
    });

    const choice = completion.choices[0];
    const response = choice.message.content ?? 'Lo sentimos, ocurrió un error. Por favor intenta de nuevo.';
    const usage = completion.usage!;

    const estimatedCostMXN =
        (usage.prompt_tokens / 1000) * MXN_COST_PER_1K_INPUT_TOKENS +
        (usage.completion_tokens / 1000) * MXN_COST_PER_1K_OUTPUT_TOKENS;

    return {
        response,
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        estimatedCostMXN,
    };
}

export async function detectIntent(userMessage: string): Promise<{ intent: string; confidence: number }> {
    const client = getClient();

    const completion = await client.chat.completions.create({
        model: MODEL,
        messages: [
            {
                role: 'system',
                content: `Clasifica el siguiente mensaje de WhatsApp de un cliente en UNA de estas categorías:
faq, booking, catalog, lead, payment, invoice, greeting, farewell, other

Responde SOLO con un objeto JSON así: {"intent": "faq", "confidence": 0.92}
No agregues ningún texto adicional.`,
            },
            { role: 'user', content: userMessage },
        ],
        max_tokens: 50,
        temperature: 0.1,
        response_format: { type: 'json_object' },
    });

    try {
        return JSON.parse(completion.choices[0].message.content!) as {
            intent: string;
            confidence: number;
        };
    } catch {
        return { intent: 'other', confidence: 0.5 };
    }
}

// src/lib/openrouter.js

/**
 * @typedef {Object} OpenRouterResponse
 * @property {{ message?: { content?: string } }[]} [choices]
 */

/**
 * Sends a prompt to OpenRouter and returns the model's response.
 * @param {string} prompt
 * @returns {Promise<string>}
 */
async function chatWithOpenRouter(prompt) {
  const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
  if (!API_KEY) throw new Error('VITE_OPENROUTER_API_KEY not set in env');

  const system = `You are a helpful assistant that generates professional emails.
Return output as JSON with keys "subject" and "body" where body may include paragraphs and line breaks.
If JSON cannot be returned, provide an email subject on the first line prefixed with "Subject:" and body after a blank line.`;

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: prompt },
  ];

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'mistralai/mistral-small-3.2-24b-instruct:free',
      messages,
      max_tokens: 700,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${text}`);
  }
  
  /** @type {OpenRouterResponse} */
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? 'No answer from model.';
}

export { chatWithOpenRouter };

export type AiProvider = 'gemini' | 'groq' | 'openrouter'
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export async function requestAiReply(input: {
  provider: AiProvider
  apiKey: string
  model: string
  messages: ChatMessage[]
}): Promise<string> {
  const { provider, apiKey, model, messages } = input
  if (!apiKey.trim()) throw new Error('أدخل مفتاح API أولاً.')
  if (!model.trim()) throw new Error('أدخل اسم النموذج.')

  if (provider === 'gemini') {
    const systemInstruction = messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n')
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
        contents: messages.filter(message => message.role !== 'system').map(message => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        })),
      }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error?.message || `Gemini HTTP ${response.status}`)
    const text = data.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('')
    if (!text) throw new Error('لم يُرجع Gemini نصاً. تحقق من النموذج أو الحصة.')
    return text
  }

  const endpoint = provider === 'groq'
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions'
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(provider === 'openrouter' ? { 'HTTP-Referer': window.location.origin, 'X-Title': 'REA AI Studio' } : {}),
    },
    body: JSON.stringify({
      model,
      messages: messages.map(message => ({ role: message.role, content: message.content })),
      temperature: 0.2,
    }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message || `${provider} HTTP ${response.status}`)
  const text = data.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) throw new Error('لم يُرجع مزوّد الذكاء الاصطناعي إجابة نصية.')
  return text
}
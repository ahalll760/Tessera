module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages } = req.body || {};
    const geminiKey = process.env.DEMO_GEMINI_KEY;

    if (!geminiKey) {
      return res.status(500).json({ error: 'Demo key not configured in Vercel environment variables.' });
    }

    // Safety limits: keep last 4 turns & cap length to prevent abuse
    const recent = (messages || []).slice(-4).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.content || '').slice(0, 1500) }]
    }));

    const systemPrompt = "You are Tessarc in Free Demo Mode. You are smart, witty, and charismatic! Match the user's language and use emojis naturally 😂✨. Format code cleanly using markdown triple backticks.";

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiKey.trim()
      },
      body: JSON.stringify({
        contents: recent,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { maxOutputTokens: 1024 }
      })
    });

    const data = await response.json();
    if (!response.ok || data.error) {
      return res.status(response.status || 500).json({ error: data?.error?.message || 'Demo service error' });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

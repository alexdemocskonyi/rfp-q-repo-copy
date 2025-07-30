import fetch from "node-fetch";

export async function handler(event) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: "Missing OpenAI API Key" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { query, matches } = body;

    const messages = [
      { role: "system", content: "You are an RFP assistant. Given a question and some possible answers, analyze them and give the most relevant, context-aware answer. If none match, suggest a possible response." },
      { role: "user", content: `Question: ${query}\n\nPossible Answers:\n${matches.map((m,i)=>`${i+1}. ${m.question} → ${m.answers.join("; ")}`).join("\n")}` }
    ];

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": \`Bearer \${apiKey}\`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 300,
        temperature: 0.4
      })
    });

    const json = await resp.json();
    const advice = json.choices?.[0]?.message?.content || "No AI advice generated.";

    return {
      statusCode: 200,
      body: JSON.stringify({ advice })
    };
  } catch (err) {
    return { statusCode: 500, body: "ChatGPT error: " + err.message };
  }
}

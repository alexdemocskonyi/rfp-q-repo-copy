exports.handler = async (event) => {
  try {
    const apiKey = process.env.OPENAI_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: "Missing API key" };
    }

    const body = JSON.parse(event.body || "{}");
    const { query, matches } = body;

    const messages = [
      { role: "system", content: "You are an RFP assistant. Provide the best context-aware answer from the list or propose a suggestion if none match." },
      { role: "user", content: `Question: ${query}\n\nPossible Answers:\n${matches.map((m, i) => `${i+1}. ${m.question} → ${m.answers.join("; ")}`).join("\n")}` }
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
        max_tokens: 250,
        temperature: 0.4
      })
    });

    const json = await resp.json();
    return {
      statusCode: 200,
      body: JSON.stringify({ advice: json.choices?.[0]?.message?.content || "No AI suggestion available." })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ advice: \`Error fetching AI suggestion: \${err.message}\` })
    };
  }
};

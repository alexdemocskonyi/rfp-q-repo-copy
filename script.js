// =======================
// ✅ SMARTER AI SEARCH TOOL
// =======================
let data = [];
const container = document.getElementById("results");
const input = document.getElementById("search-box");
const OPENAI_KEY = "process.env.OPENAI_KEY";

async function loadData() {
  try {
    const res = await fetch("rfp_data_with_local_embeddings.json");
    data = await res.json();
    console.log(`✅ Loaded ${data.length} records.`);
  } catch (err) {
    console.error("❌ Failed to load data:", err);
  }
}

function fuzzyMatch(query, text) {
  return text.toLowerCase().includes(query.toLowerCase()) ||
         text.toLowerCase().replace(/[^a-z]/g,"").includes(query.toLowerCase().replace(/[^a-z]/g,""));
}

async function getAISuggestions(query, candidates) {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are an RFP expert providing context-aware, helpful answers."},
          { role: "user", content: `Query: "${query}"\nPossible answers:\n${candidates.map(c=>c.answers.join(" | ")).join("\n")}\nSuggest the most relevant response:`}
        ],
        max_tokens: 150
      })
    });
    const json = await response.json();
    return json.choices?.[0]?.message?.content || "";
  } catch (err) {
    console.warn("AI suggestion failed:", err);
    return "";
  }
}

async function search(query) {
  if (query.length < 4) {
    container.innerHTML = "";
    return;
  }

  const results = data.filter(entry => fuzzyMatch(query, entry.question)).slice(0, 10);

  container.innerHTML = "";

  if (results.length === 0) {
    container.innerHTML = `<p>No direct matches found. Trying AI suggestion...</p>`;
    const suggestion = await getAISuggestions(query, []);
    if (suggestion) container.innerHTML += `<div class="card"><strong>AI Suggestion:</strong> ${suggestion}</div>`;
    return;
  }

  results.forEach(result => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <strong>Q:</strong> ${result.question}<br>
      <details><summary>Answers (${result.answers.length})</summary>
      <ul>${result.answers.map(a=>`<li>${a}</li>`).join("")}</ul></details>
    `;
    container.appendChild(card);
  });

  const aiSuggestion = await getAISuggestions(query, results);
  if (aiSuggestion) {
    container.innerHTML += `<div class="card" style="background:#eef;">
      <strong>🤖 AI Suggested Answer:</strong><br>${aiSuggestion}
    </div>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadData();
  input.addEventListener("input", e => search(e.target.value.trim()));
});

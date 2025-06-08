let data = [];
const container = document.getElementById("results");
const input = document.getElementById("search-box");

async function loadData() {
  const res = await fetch("rfp_data_with_local_embeddings.json");
  data = await res.json();
}

function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return dot / (magA * magB);
}

function keywordScore(query, text) {
  query = query.toLowerCase();
  text = text.toLowerCase();
  if (text.includes(query)) return 0.3;
  if (text.startsWith(query)) return 0.2;
  if (text.split(" ").some(word => word.startsWith(query))) return 0.1;
  return 0;
}

function highlight(text, query) {
  const regex = new RegExp(\`(\${query})\`, "gi");
  return text.replace(regex, '<mark>$1</mark>');
}

async function embedQuery(query) {
  const response = await fetch("/.netlify/functions/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: query }),
  });
  const json = await response.json();
  return json;
}

function renderResults(results, query) {
  container.innerHTML = "";
  results.forEach(result => {
    const card = document.createElement("div");
    card.className = "card";
    const answerList = result.answers.map(ans => `<li>${ans}</li>`).join("");
    card.innerHTML = \`
      <strong>Q:</strong> \${highlight(result.question, query)}<br>
      <details><summary><strong>Answers (\${result.answers.length})</strong></summary><ul>\${answerList}</ul></details>
      <small>Score: \${result.score.toFixed(3)}</small>
    \`;
    container.appendChild(card);
  });
}

async function search(query) {
  if (query.length < 4) {
    container.innerHTML = "";
    return;
  }

  let queryEmbedding = null;
  try {
    queryEmbedding = await embedQuery(query);
  } catch (err) {
    console.warn("⚠️ Embedding failed, fallback to keyword only");
  }

  const results = data
    .map(entry => {
      const sim = queryEmbedding?.length ? cosineSimilarity(queryEmbedding, entry.embedding) : 0;
      const kw = keywordScore(query, entry.question);
      return {
        ...entry,
        score: sim + kw
      };
    })
    .filter(r => r.score >= 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  renderResults(results, query);
}

document.addEventListener("DOMContentLoaded", () => {
  loadData();
  input.addEventListener("input", e => {
    const query = e.target.value.trim();
    search(query);
  });
});

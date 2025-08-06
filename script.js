// script.js
let data = [];
let fuse;

// 1) Load the local JSON dataset
async function loadData() {
  if (data.length) return;
  console.log("🔄 Fetching dataset...");
  const res = await fetch("rfp_data_with_local_embeddings.json?t=" + Date.now());
  data = await res.json();
  console.log(`✅ Loaded ${data.length} records`);
  fuse = new Fuse(data, {
    includeScore: true,
    threshold: 0.4,
    keys: ["question"]
  });
}

// 2) Render a list of matches
function render(matches) {
  const out = matches.map(m =>
    `<div class="result"><strong>${m.item.question}</strong><p>${m.item.answers[0] || ""}</p></div>`
  ).join("");
  document.querySelector("#results").innerHTML = out || "<p>No results.</p>";
}

// 3) Text search
async function generalSearch() {
  await loadData();
  const q = document.querySelector("#search-box").value.trim();
  if (!q) return render([]);
  const matches = fuse.search(q, { limit: 5 });
  render(matches);
}

// 4) Simple “AI” chat via embeddings + local database
async function handleChatQuery(userInput) {
  await loadData();
  const matches = fuse.search(userInput, { limit: 1 });
  const best = matches[0]?.item;
  document.querySelector("#chatbot-response").textContent =
    best?.answers[0] || "Sorry, no match found.";
}

// 5) Wire buttons
document.querySelector("#search-button")
  .addEventListener("click", generalSearch);

document.querySelector("#chat-button")
  .addEventListener("click", () => {
    const inp = document.querySelector("#chat-input").value.trim();
    handleChatQuery(inp);
  });

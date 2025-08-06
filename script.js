// script.js
let data = [];
let fuse;

// cosine similarity helper
function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// 1) load data + init Fuse
async function loadData() {
  if (data.length) return;
  const res = await fetch(`rfp_data_with_local_embeddings.json?t=${Date.now()}`);
  data = await res.json();
  fuse = new Fuse(data, {
    includeScore: true,
    threshold: 0.4,
    keys: ["question"],
  });
}

// 2) grouped render
function renderGrouped({ direct, fuzzy, context }, container) {
  container.innerHTML = "";
  [
    { title: "🔍 Direct Matches", items: direct },
    { title: "✏️ Fuzzy Matches", items: fuzzy },
    { title: "🤖 Contextual Matches", items: context },
  ].forEach((bucket) => {
    if (!bucket.items.length) return;
    const section = document.createElement("div");
    section.innerHTML = `<h3>${bucket.title}</h3>`;
    const list = document.createElement("div");
    list.className = "bucket-list";
    bucket.items.slice(0, 3).forEach((item) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `<strong>Q:</strong> ${item.question}<br><em>A:</em> ${item.answers[0]}`;
      list.appendChild(card);
    });
    if (bucket.items.length > 3) {
      const more = document.createElement("button");
      more.textContent = "Show more";
      let open = false;
      more.onclick = () => {
        open = !open;
        list.innerHTML = "";
        bucket.items.slice(0, open ? bucket.items.length : 3).forEach((item) => {
          const card = document.createElement("div");
          card.className = "card";
          card.innerHTML = `<strong>Q:</strong> ${item.question}<br><em>A:</em> ${item.answers[0]}`;
          list.appendChild(card);
        });
        more.textContent = open ? "Show less" : "Show more";
      };
      section.appendChild(list);
      section.appendChild(more);
    } else {
      section.appendChild(list);
    }
    container.appendChild(section);
  });
}

// 3) general search
async function generalSearch() {
  await loadData();
  const q = document.querySelector("#search-box").value.trim();
  const out = document.querySelector("#results");
  if (q.length < 3) {
    out.innerHTML = "";
    return;
  }

  // direct
  const direct = data.filter((d) =>
    d.question.toLowerCase().includes(q.toLowerCase())
  );
  // fuzzy
  const fuzzy = fuse.search(q).map((r) => r.item);
  // contextual
  let context = [];
  try {
    const r = await fetch("/.netlify/functions/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: q }),
    });
    const js = await r.json();
    const emb = js.data?.[0]?.embedding;
    if (emb) {
      context = data
        .map((d) => ({ item: d, score: cosineSimilarity(emb, d.embedding) }))
        .filter((x) => x.score > 0.3)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.item);
    }
  } catch (e) {
    console.warn("⚠️ Contextual fail:", e);
  }

  renderGrouped({ direct, fuzzy, context }, out);
}

// 4) AI chat with fallback
async function handleChat() {
  await loadData();
  const q = document.querySelector("#chat-input").value.trim();
  const resp = document.querySelector("#chatbot-response");
  resp.textContent = "…thinking…";

  // try OpenAI
  try {
    const r = await fetch("/.netlify/functions/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: q }],
      }),
    });
    const js = await r.json();
    const ans = js.choices?.[0]?.message?.content;
    if (ans) {
      resp.textContent = ans;
      return;
    }
  } catch (e) {
    console.warn("⚠️ AI chat fail:", e);
  }

  // fallback: best DB match
  const best = fuse.search(q, { limit: 1 })[0]?.item;
  resp.textContent = best?.answers[0] || "Sorry, I don’t know.";
}

// 5) wire up
document.querySelector("#search-button").onclick = generalSearch;
document.querySelector("#chat-button").onclick = handleChat;

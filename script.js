let data = [];
let fuse;

async function loadData() {
  try {
    const res = await fetch("rfp_data_with_local_embeddings.json");
    data = await res.json();
    console.log(`✅ Loaded ${data.length} records`);
    fuse = new Fuse(data, { includeScore: true, threshold: 0.4, keys: ["question"] });
  } catch (err) {
    console.error("❌ Failed to load data:", err);
  }
}

function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return dot / (magA * magB);
}

async function embedQuery(query) {
  try {
    const res = await fetch("/.netlify/functions/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: query, model: "text-embedding-3-small" })
    });
    const json = await res.json();
    return json.data?.[0]?.embedding || null;
  } catch (err) {
    return null;
  }
}

function highlight(text, query) {
  const regex = new RegExp(`(${query})`, "gi");
  return text.replace(regex, '<mark>$1</mark>');
}

function renderGroupedResults(query, directMatches, fuzzyMatches, contextualMatches) {
  const container = document.getElementById("general-results");
  container.innerHTML = "";

  function createSection(title, matches, groupId) {
    if (!matches.length) return "";

    const initial = matches.slice(0, 5);
    const hidden = matches.slice(5);

    let html = `<h3>${title}</h3>`;
    html += initial.map((m,i) => `
      <div class="card">
        <strong>Q:</strong> ${highlight(m.question, query)}<br>${m.answers.join(" ")}
        <br><button class="ask-ai-btn" data-q="${encodeURIComponent(m.question)}">💬 Ask AI about this</button>
      </div>`).join("");

    if (hidden.length > 0) {
      html += `<div id="hidden-${groupId}" style="display:none;">` +
        hidden.map((m,i) => `
          <div class="card">
            <strong>Q:</strong> ${highlight(m.question, query)}<br>${m.answers.join(" ")}
            <br><button class="ask-ai-btn" data-q="${encodeURIComponent(m.question)}">💬 Ask AI about this</button>
          </div>`).join("") + 
        `</div>
        <button class="show-more-btn" data-target="hidden-${groupId}">Show more...</button>`;
    }

    return html;
  }

  container.innerHTML += createSection("🔹 Direct Matches", directMatches, "direct");
  container.innerHTML += createSection("🔸 Fuzzy Matches", fuzzyMatches, "fuzzy");
  container.innerHTML += createSection("🤖 Contextual Matches", contextualMatches, "context");

  // Bind Ask AI buttons
  document.querySelectorAll(".ask-ai-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const q = decodeURIComponent(btn.dataset.q);
      const selected = data.find(item => item.question === q);
      if (selected) {
        addMessage("user", "💬 Ask AI about this result → " + selected.question);
        const aiResponse = await callGPTWithContext(selected.question, [selected]);
        addMessage("assistant", aiResponse);
      }
    });
  });

  // Bind Show More buttons
  document.querySelectorAll(".show-more-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      const hiddenSection = document.getElementById(targetId);
      if (hiddenSection) {
        hiddenSection.style.display = "block";
        btn.style.display = "none";
      }
    });
  });
}

async function generalSearch(query) {
  if (query.length < 4) {
    document.getElementById("general-results").innerHTML = "";
    return;
  }

  const directMatches = data.filter(item => item.question.toLowerCase().includes(query.toLowerCase()));
  const fuzzyMatches = fuse.search(query).map(r => r.item).filter(i => !directMatches.includes(i));

  let contextualMatches = [];
  const queryEmbedding = await embedQuery(query);
  if (queryEmbedding) {
    contextualMatches = data.map(item => ({
      ...item,
      _sim: cosineSimilarity(queryEmbedding, item.embedding)
    }))
    .filter(r => r._sim > 0.3 && !directMatches.includes(r) && !fuzzyMatches.includes(r))
    .sort((a,b) => b._sim - a._sim)
    .slice(0, 20);
  }

  renderGroupedResults(query, directMatches, fuzzyMatches, contextualMatches);
}

function addMessage(role, text) {
  const msg = document.createElement("div");
  msg.className = `msg ${role}`;
  msg.innerHTML = text.replace(/\n/g, "<br>");
  document.getElementById("chat-history").appendChild(msg);
  document.getElementById("chat-history").scrollTop = document.getElementById("chat-history").scrollHeight;
}

async function callGPTWithContext(query, matches) {
  try {
    const res = await fetch("/.netlify/functions/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are an assistant that answers questions using the provided RFP dataset. If relevant, also include 2-3 useful links from the internet at the end of your answer." },
          { role: "user", content: `User query: ${query}\nRelevant dataset entries:\n${JSON.stringify(matches, null, 2)}\nProvide the most accurate answer and append helpful web links.` }
        ]
      })
    });
    const json = await res.json();
    return json.choices?.[0]?.message?.content || "⚠️ AI returned no response.";
  } catch (err) {
    return "⚠️ AI unavailable (network/API error).";
  }
}

async function handleChatQuery() {
  const query = document.getElementById("chat-input").value.trim();
  if (!query) return;
  addMessage("user", query);
  document.getElementById("chat-input").value = "";

  // Search matches
  let matches = data.filter(item => item.question.toLowerCase().includes(query.toLowerCase()));
  if (matches.length < 1) matches = fuse.search(query).map(r => r.item);

  if (matches.length < 1) {
    const queryEmbedding = await embedQuery(query);
    if (queryEmbedding) {
      matches = data.map(item => ({
        ...item,
        _sim: cosineSimilarity(queryEmbedding, item.embedding)
      }))
      .sort((a,b) => b._sim - a._sim)
      .slice(0, 3);
    }
  }

  if (matches.length < 1 && data.length > 0) {
    matches = [data[0]];
  }

  const aiResponse = await callGPTWithContext(query, matches);
  addMessage("assistant", aiResponse);
}

document.addEventListener("DOMContentLoaded", () => {
  loadData();
  const searchBox = document.getElementById("general-search");
  if (searchBox) searchBox.addEventListener("input", e => generalSearch(e.target.value.trim()));
  const sendBtn = document.getElementById("send-btn");
  if (sendBtn) sendBtn.addEventListener("click", handleChatQuery);
  const chatInput = document.getElementById("chat-input");
  if (chatInput) chatInput.addEventListener("keypress", e => { if (e.key === "Enter") handleChatQuery(); });
});

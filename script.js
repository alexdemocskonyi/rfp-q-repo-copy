let data = [];
const resultsContainer = document.getElementById("results");
const searchBox = document.getElementById("general-search");
const fuseOptions = { includeScore: true, threshold: 0.4, keys: ["question"] };
let fuse;

async function loadData() {
  try {
    console.log("🔄 Fetching dataset...");
    const res = await fetch("rfp_data_with_local_embeddings.json?t=" + Date.now());
    data = await res.json();
    console.log(`✅ Loaded ${data.length} records`);
    fuse = new Fuse(data, fuseOptions);
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
    console.warn("⚠️ AI embedding failed, skipping contextual matches.");
    return null;
  }
}

function renderGroup(title, results, query) {
  if (!results.length) return "";
  let html = `<h3>${title}</h3>`;
  results.slice(0, 5).forEach(result => {
    const answersPreview = result.answers.map(ans => {
      const lines = ans.toString().split("\n");
      const shortText = lines.slice(0, 3).join("<br>");
      const moreText = lines.slice(3).join("<br>");
      return `<div class="answer">${shortText}${moreText ? `<details><summary>More...</summary>${moreText}</details>` : ""}</div>`;
    }).join("");
    html += `<div class="card"><strong>Q:</strong> ${result.question}<br>${answersPreview}</div>`;
  });
  if (results.length > 5) {
    html += `<button onclick="this.nextElementSibling.style.display='block';this.remove()">Show More</button>`;
    html += `<div style="display:none">${results.slice(5).map(r=>`<div class='card'><strong>Q:</strong> ${r.question}</div>`).join("")}</div>`;
  }
  return html;
}

async function search(query) {
  if (query.length < 4) {
    resultsContainer.innerHTML = "";
    return;
  }

  console.log("🔍 Searching for:", query);

  const directMatches = data.filter(item => item.question.toLowerCase().includes(query.toLowerCase()))
    .map(item => ({ ...item, score: 1 }));
  const fuzzyMatches = fuse.search(query).map(r => ({ ...r.item, score: 0.6 }));

  const queryEmbedding = await embedQuery(query);
  const contextualMatches = queryEmbedding
    ? data.map(item => ({ ...item, score: cosineSimilarity(queryEmbedding, item.embedding) }))
        .filter(r => r.score > 0.3)
        .sort((a,b)=>b.score-a.score)
    : [];

  resultsContainer.innerHTML =
    renderGroup("Direct Matches", directMatches, query) +
    renderGroup("Fuzzy Matches", fuzzyMatches, query) +
    renderGroup("AI Contextual Matches", contextualMatches, query);
}

document.addEventListener("DOMContentLoaded", () => {
  loadData();
  if (searchBox) {
    searchBox.addEventListener("input", e => search(e.target.value.trim()));
    console.log("✅ Search listener attached");
  }
});

// ==================== AI CHATBOT SECTION ====================
async function askAIChat(query) {
  try {
    // Take top 10 matches for context
    const direct = data.filter(item => item.question.toLowerCase().includes(query.toLowerCase())).slice(0,5);
    const fuzzy = fuse.search(query).map(r=>r.item).slice(0,5);
    const combined = [...direct,...fuzzy];
    const context = combined.map(q=>`Q: ${q.question}\nA: ${q.answers.join(" ")}`).join("\n\n");

    const res = await fetch("/.netlify/functions/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a helpful assistant answering questions strictly based on the provided RFP Q&A context. If unsure, say 'I couldn't find a relevant answer'."},
          { role: "user", content: `Context:\n${context}\n\nUser question:\n${query}\n\nAnswer concisely and cite relevant Q&A if possible.` }
        ]
      })
    });
    const json = await res.json();
    return json.choices?.[0]?.message?.content || "⚠️ No AI response available.";
  } catch (err) {
    console.error("AI chat error:", err);
    return "⚠️ AI chat failed.";
  }
}

function addMessage(sender,text){
  const msgBox=document.getElementById("chat-messages");
  msgBox.innerHTML += `<div><b>${sender}:</b> ${text}</div>`;
  msgBox.scrollTop=msgBox.scrollHeight;
}

async function handleChatQuery(){
  const input=document.getElementById("chat-input");
  const query=input.value.trim();
  if(!query) return;
  addMessage("🧑 You", query);
  input.value="";
  const reply=await askAIChat(query);
  addMessage("🤖 AI", reply);
}

document.addEventListener("DOMContentLoaded",()=>{
  const btn=document.getElementById("send-btn");
  if(btn) btn.addEventListener("click",handleChatQuery);
  const chatInput=document.getElementById("chat-input");
  if(chatInput) chatInput.addEventListener("keypress",e=>{if(e.key==="Enter")handleChatQuery();});
});

let data = [];
let fuse = null;

async function loadData() {
  try {
    const res = await fetch("data.json");
    if (!res.ok) throw new Error("data.json fetch failed");
    const records = await res.json();
    console.log("✅ Loaded", records.length, "records");
    data = records;
    fuse = new Fuse(data, {
      keys: ["question", "answers"],
      threshold: 0.4,
    });
  } catch (err) {
    console.error("❌ Failed to load data.json:", err);
    data = [];
  }
}

function render(results) {
  const container = document.querySelector("#results");
  container.innerHTML = "";
  if (!results || results.length === 0) {
    container.innerHTML = "<p>No matching results.</p>";
    return;
  }

  results.forEach((result) => {
    const div = document.createElement("div");
    div.classList.add("result");

    const q = document.createElement("p");
    q.classList.add("question");
    q.textContent = result.question;
    div.appendChild(q);

    const ul = document.createElement("ul");
    (result.answers || []).forEach((a) => {
      const li = document.createElement("li");
      li.textContent = a;
      ul.appendChild(li);
    });

    div.appendChild(ul);
    container.appendChild(div);
  });
}

async function generalSearch() {
  const input = document.querySelector("#search-box").value.trim();
  if (!fuse || data.length === 0) await loadData();
  if (!input || input.length < 4) return render([]);

  const matches = fuse.search(input, { limit: 10 }).map((m) => m.item);
  render(matches);
}

async function handleChatQuery(userInput) {
  const responseBox = document.querySelector("#chatbot-response");
  if (!userInput || typeof userInput !== "string" || userInput.length < 4) {
    responseBox.textContent = "Please enter a longer question.";
    return;
  }

  responseBox.textContent = "Thinking...";

  try {
    const res = await fetch("/.netlify/functions/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: userInput }),
    });

    const json = await res.json();
    responseBox.textContent =
      json?.answer || "No answer returned from the AI.";
  } catch (err) {
    console.error("❌ Chat error:", err);
    responseBox.textContent = "Something went wrong.";
  }
}

window.addEventListener("DOMContentLoaded", () => {
  document
    .querySelector("#search-button")
    .addEventListener("click", generalSearch);

  document
    .querySelector("#chat-form")
    .addEventListener("submit", (e) => {
      e.preventDefault();
      const val = document.querySelector("#chat-box").value;
      handleChatQuery(val);
    });

  loadData();
});
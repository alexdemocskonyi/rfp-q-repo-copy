async function askAIChat(query) {
  try {
    const res = await fetch("/.netlify/functions/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a helpful assistant answering questions strictly based on the provided RFP Q&A context. If unsure, say 'I couldn't find a relevant answer'."},
          { role: "user", content: `User question:\n${query}\nAnswer concisely.` }
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

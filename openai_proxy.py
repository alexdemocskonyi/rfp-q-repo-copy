from flask import Flask, request
from flask_cors import CORS
import os, requests
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("OPENAI_API_KEY")
app = Flask(__name__)
CORS(app)

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"

@app.route("/ask", methods=["POST"])
def ask():
    user_data = request.json

    # First: get AI answer from dataset context
    r = requests.post(OPENAI_CHAT_URL,
        headers={"Authorization": f"Bearer {API_KEY}", "Content-Type":"application/json"},
        json=user_data)
    base_response = r.json()
    content = base_response.get("choices", [{}])[0].get("message", {}).get("content", "⚠️ AI failed to respond.")

    # Extract user query
    user_msg = ""
    for m in user_data.get("messages", []):
        if m.get("role") == "user":
            user_msg = m.get("content")

    # Second: Web-enhanced GPT call (simulate browsing for relevant links)
    try:
        web_prompt = [
            {"role": "system", "content": "You are an assistant that searches the web for authoritative sources. For the given query, return the 3 most relevant URLs (with titles) from trustworthy sources related to the topic. Provide them as a markdown list of clickable links."},
            {"role": "user", "content": user_msg}
        ]
        web_r = requests.post(OPENAI_CHAT_URL,
            headers={"Authorization": f"Bearer {API_KEY}", "Content-Type":"application/json"},
            json={"model": "gpt-4o", "messages": web_prompt})
        web_data = web_r.json()
        links = web_data.get("choices", [{}])[0].get("message", {}).get("content", "")

        if links:
            content += "\n\n---\n🌐 **Additional resources found online:**\n" + links
    except Exception as e:
        print("Web augmentation error:", e)

    return {"choices": [{"message": {"content": content}}]}, 200

@app.route("/embed", methods=["POST"])
def embed():
    r = requests.post("https://api.openai.com/v1/embeddings",
        headers={"Authorization": f"Bearer {API_KEY}", "Content-Type":"application/json"},
        json=request.json)
    return (r.text, r.status_code, {'Content-Type':'application/json'})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5500)

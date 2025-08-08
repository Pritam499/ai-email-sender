# 📧 AI Generated Email Sender

An easy-to-use **AI-powered email generator** built with **OpenRouter** and the **Qwen3-Coder (Free)** model.  
Generate, edit, and send professional emails in seconds — no backend required!

---

## ✨ Features
- 🎯 **AI Email Drafting** – Write professional, friendly, or casual emails instantly.
- 📜 **Multiple Tones** – Choose from professional, casual, friendly, or follow-up styles.
- 🖊 **Editable Preview** – Review and tweak before sending.
- 📤 **Direct Sending** – Opens your email client with the generated email.
- ⚡ **No Backend** – All API calls are done client-side for faster response.

---

## 🛠 Tech Stack
- **Frontend:** React, Vite
- **Styling:** Tailwind CSS
- **AI Integration:** OpenRouter API
- **AI API:** [OpenRouter](https://openrouter.ai/v1)
- **Model:** [`qwen/qwen3-coder:free`](https://openrouter.ai/qwen/qwen3-coder:free)

---

## 📦 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Pritam499/ai-email-sender.git
   cd ai-email-sender

   ---
Install dependencies
If your project uses npm:

bash
Copy
Edit
npm install
Create .env file
Inside your project folder, create a .env file and add:

env
Copy
Edit
OPENROUTER_API_KEY=your_api_key_here
Get your free API key

Go to OpenRouter Signup

Create a free account

Visit the API Keys page

Copy your key and paste it into .env

🚀 Usage
Run your app

bash
Copy
Edit
npm run dev

Enter recipient email – Type or paste email addresses.

Choose tone & prompt – Select from Professional, Casual, Friendly, or Follow-up and write your request.

Generate Email – Click Generate Email and the AI will create a draft.

Send – Review and click Send to open your default email client.

🔐 Environment Variables
Variable	Description
OPENROUTER_API_KEY	Your OpenRouter API key

⚠ Do not share your API key — keep it private.

📄 Example .env
env
Copy
Edit
OPENROUTER_API_KEY=sk-or-xxxxxxxxxxxxxxxxxxxxxxxx
📚 API Reference
Endpoint

bash
Copy
Edit
POST https://openrouter.ai/api/v1/chat/completions
Headers

http
Copy
Edit
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
Body Example

json
Copy
Edit
{
  "model": "qwen/qwen3-coder:free",
  "messages": [
    { "role": "system", "content": "You are a helpful email assistant." },
    { "role": "user", "content": "Write a polite follow-up email asking for a decision." }
  ]
}

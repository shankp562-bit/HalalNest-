const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();
const path = require("path");

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://www.gstatic.com", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://i.postimg.cc", "https://i.ytimg.com"],
      frameSrc: ["'self'", "https://www.youtube-nocookie.com"],
      connectSrc: ["'self'", "https://openrouter.ai", "https://api.aladhan.com"]
    }
  }
}));

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || process.env.openrouter_api_key;
const SCHOLAR_UNAVAILABLE_MSG = "❌ The scholar assistant is currently unavailable. Please try again later or consult your local imam.";
if (!OPENROUTER_API_KEY) {
  console.warn("⚠️ OPENROUTER_API_KEY not set — scholar endpoint will return 503");
}

app.post("/api/ask-scholar", async (req, res) => {
  if (!OPENROUTER_API_KEY) return res.status(503).json({ error: SCHOLAR_UNAVAILABLE_MSG });

  const { question } = req.body || {};
  if (!question || !question.trim()) return res.status(400).json({ error: "Please type a question." });

  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://halalnest.local",
        "X-Title": "HalalNest Scholar Assistant"
      },
      body: JSON.stringify({
        model: "x-ai/grok-4-fast:free",
        messages: [
          { role: "system", content: "You are a trusted Islamic scholar assistant. Use Qur’an, authentic Sunnah and established fiqh. Be clear, cite sources when possible, and suggest asking a local scholar for complex matters. Conclude with ‘Wallahu a‘lam’." },
          { role: "user", content: question }
        ],
        temperature: 0.7,
        max_tokens: 800
      })
    });

    const data = await r.json();

    if (!r.ok) {
      const msg = data?.error?.message || (r.status === 503 ? SCHOLAR_UNAVAILABLE_MSG : `Upstream ${r.status}`);
      return res.status(r.status).json({ error: `Scholar error: ${msg}` });
    }

    const answer = data?.choices?.[0]?.message?.content;
    if (!answer) return res.status(502).json({ error: "Empty response from scholar. Please retry." });

    res.json({ answer, model: data.model, usage: data.usage, at: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: SCHOLAR_UNAVAILABLE_MSG });
  }
});

app.get("/api/prayer-times", async (req, res) => {
  const { city = "Riyadh", country = "Saudi Arabia", method = 2 } = req.query;
  try {
    const r = await fetch(`https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=${method}`);
    const j = await r.json();
    res.json(j);
  } catch (e) {
    res.status(500).json({ error: "Prayer times service unavailable" });
  }
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    time: new Date().toISOString(),
    scholarAvailable: !!OPENROUTER_API_KEY
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ HalalNest running http://localhost:${PORT}`);
  if (OPENROUTER_API_KEY) {
    console.log("🔐 Scholar assistant enabled");
  } else {
    console.warn("⚠️ Scholar assistant disabled - set OPENROUTER_API_KEY and restart");
  }
});

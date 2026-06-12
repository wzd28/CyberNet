require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are CyberNet AI, a cybersecurity assistant. Help users identify cyber threats, phishing attacks, scams, malware, and security risks."
        },
        {
          role: "user",
          content: message
        }
      ],
      max_tokens: 500
    });

    res.json({
      reply: completion.choices[0].message.content
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      reply: "CyberNet AI is currently unavailable."
    });
  }
});

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`CyberNet running on http://localhost:${PORT}`);
});
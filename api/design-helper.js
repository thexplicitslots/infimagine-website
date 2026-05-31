const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 900);
}

function buildPrompt(payload) {
  const lines = [
    `Project type: ${cleanText(payload.projectType)}`,
    `Approximate size: ${cleanText(payload.size)}`,
    `Dimensions: ${cleanText(payload.dimensions)}`,
    `Design readiness: ${cleanText(payload.readiness)}`,
    `Reference link: ${cleanText(payload.referenceLink)}`,
    `Material preference: ${cleanText(payload.material)}`,
    `Color: ${cleanText(payload.color)}`,
    `Finish: ${cleanText(payload.finish)}`,
    `Strength priority: ${cleanText(payload.strength)}`,
    `Customer idea: ${cleanText(payload.description)}`,
  ];

  return `Expand the design possibilities for this custom 3D printing idea. Focus only on creative and functional ways the object could be improved, styled, personalized, or made more useful:\n${lines.join("\n")}`;
}

function fallbackText(payload) {
  return [
    "Design possibilities:",
    `Start with: ${cleanText(payload.description) || "a custom 3D printed object."}`,
    "",
    "Ways to make it better:",
    "- Add rounded edges, cleaner proportions, and a more premium silhouette.",
    "- Consider personalization such as initials, logo details, pattern texture, or modular inserts.",
    "- Add functional touches such as cable channels, hidden slots, grip pads, clips, hinges, or magnetic areas if useful.",
    "",
    "Style directions:",
    "- Minimal and matte.",
    "- Futuristic with fine-line geometric details.",
    "- Smooth premium object with subtle contrast accents.",
  ].join("\n");
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    return sendJson(response, 405, { error: "Use POST for the AI design helper." });
  }

  if (!process.env.GEMINI_API_KEY) {
    return sendJson(response, 500, {
      error: "AI helper needs GEMINI_API_KEY added in Vercel project environment variables.",
    });
  }

  try {
    const payload = typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
    const aiResponse = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "x-goog-api-key": process.env.GEMINI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [
            {
              text: [
                "You are InfiMagine's AI Design Possibility Helper for custom 3D printing.",
                "Your only job is to help the customer imagine better versions of their object.",
                "Suggest creative design directions, useful features, personalization ideas, aesthetic styles, shape improvements, and optional enhancements.",
                "Do not write a project brief. Do not include quantity, pricing, budget, timeline, delivery, location, manufacturability, production warnings, or business/admin details.",
                "Do not ask follow-up questions unless they directly unlock design possibilities.",
                "Mention materials only as design/feel possibilities, not as engineering approval.",
                "Use plain text labels instead of Markdown bold.",
                "Keep the answer under 180 words and format it with clear labels.",
              ].join(" "),
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: buildPrompt(payload) }],
          },
        ],
        generationConfig: {
          temperature: 0.45,
          topP: 0.9,
          maxOutputTokens: 900,
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      }),
    });

    const data = await aiResponse.json();

    if (!aiResponse.ok) {
      return sendJson(response, aiResponse.status, {
        error: data.error?.message || "Gemini could not generate a brief right now.",
      });
    }

    return sendJson(response, 200, {
      brief: data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || fallbackText(payload),
    });
  } catch (error) {
    return sendJson(response, 500, {
      error: "AI helper had trouble refining the idea. Please try again.",
    });
  }
};

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
    `Quantity: ${cleanText(payload.quantity)}`,
    `Approximate size: ${cleanText(payload.size)}`,
    `Dimensions: ${cleanText(payload.dimensions)}`,
    `Design readiness: ${cleanText(payload.readiness)}`,
    `Reference link: ${cleanText(payload.referenceLink)}`,
    `Material preference: ${cleanText(payload.material)}`,
    `Color: ${cleanText(payload.color)}`,
    `Finish: ${cleanText(payload.finish)}`,
    `Strength priority: ${cleanText(payload.strength)}`,
    `Timeline: ${cleanText(payload.timeline)}`,
    `Budget: ${cleanText(payload.budget)}`,
    `Delivery: ${cleanText(payload.delivery)}`,
    `Location: ${cleanText(payload.location)}`,
    `Customer idea: ${cleanText(payload.description)}`,
  ];

  return `Create a premium, practical 3D-printing design brief for InfiMagine from these customer inputs:\n${lines.join("\n")}`;
}

function fallbackText(payload) {
  return [
    "Refined project brief:",
    cleanText(payload.description) || "Customer wants a custom 3D printed object.",
    "",
    "Recommended direction:",
    `Use ${cleanText(payload.material)} with a ${cleanText(payload.finish).toLowerCase()} approach. Prioritize ${cleanText(payload.strength).toLowerCase()}.`,
    "",
    "Feasibility notes:",
    "- Confirm final dimensions and wall thickness before printing.",
    "- Share reference images or a CAD file if available.",
    "- For functional parts, confirm load, heat, and outdoor exposure requirements.",
    "",
    "Questions before production:",
    "1. What exact dimensions and tolerances are required?",
    "2. Is this for display, daily use, load-bearing use, or outdoor use?",
    "3. Should the finish be raw printed, sanded, painted, or premium smooth?",
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
                "You are InfiMagine's AI Design Helper for custom 3D printing.",
                "Turn customer ideas into concise, practical, premium project briefs.",
                "Do not promise manufacturability. Flag assumptions and ask smart follow-up questions.",
                "Recommend materials only from PLA, PETG, ABS/ASA, Nylon, PEEK, flexible, or 'recommend after review'.",
                "Use plain text labels instead of Markdown bold.",
                "Keep the answer under 220 words and format it with clear labels.",
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

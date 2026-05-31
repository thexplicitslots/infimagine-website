const { redirect, setSessionCookie, validateCredentials } = require("../lib/admin-auth");

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10_000) {
        request.destroy();
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    redirect(response, "/admin");
    return;
  }

  try {
    const body = await readBody(request);
    const form = new URLSearchParams(body);
    const username = form.get("username") || "";
    const password = form.get("password") || "";

    if (!validateCredentials(username, password)) {
      redirect(response, "/admin?error=1");
      return;
    }

    setSessionCookie(response);
    redirect(response, "/admin");
  } catch {
    redirect(response, "/admin?error=1");
  }
};

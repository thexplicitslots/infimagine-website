const { clearSessionCookie, redirect } = require("../lib/admin-auth");

module.exports = function handler(request, response) {
  clearSessionCookie(response);
  redirect(response, "/admin");
};

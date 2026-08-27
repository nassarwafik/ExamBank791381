const { app } = require("@azure/functions");
const {
  TOKEN_TTL_SECONDS,
  createBuilderToken,
  validateBuilderCredentials
} = require("../lib/builder-auth");

app.http("builderLogin", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "builder-login",

  handler: async request => {
    try {
      let body = {};

      try {
        body = await request.json();
      }
      catch {
        body = {};
      }

      const userCode = String(body?.userCode || "").trim();
      const password = String(body?.password || "");

      if (!userCode || !password) {
        return {
          status: 400,
          jsonBody: {
            ok: false,
            error: "كود المستخدم وكلمة المرور مطلوبان."
          }
        };
      }

      if (!validateBuilderCredentials(userCode, password)) {
        return {
          status: 401,
          jsonBody: {
            ok: false,
            error: "بيانات الدخول غير صحيحة."
          }
        };
      }

      const token = createBuilderToken(userCode);

      return {
        status: 200,
        jsonBody: {
          ok: true,
          token,
          userCode,
          expiresInSeconds: TOKEN_TTL_SECONDS
        }
      };
    }
    catch (error) {
      return {
        status: 500,
        jsonBody: {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Unknown builder login error"
        }
      };
    }
  }
});

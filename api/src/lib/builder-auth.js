const crypto = require("crypto");

const TOKEN_TTL_SECONDS = 8 * 60 * 60;

function base64UrlEncode(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getSigningSecret() {
  return (
    process.env.BUILDER_SESSION_SECRET ||
    process.env.BANK_SETUP_KEY ||
    ""
  );
}

function getBuilderPassword() {
  return (
    process.env.BUILDER_PASSWORD ||
    process.env.BANK_SETUP_KEY ||
    ""
  );
}

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function signPayload(encodedPayload, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
}

function createSignedAssetParams(blobName, ttlSeconds = 15 * 60) {
  const secret = getSigningSecret();

  if (!secret) {
    throw new Error(
      "BUILDER_SESSION_SECRET or BANK_SETUP_KEY is not configured"
    );
  }

  const exp = Math.floor(Date.now() / 1000) + Math.max(60, ttlSeconds);
  const message = `asset\n${exp}\n${String(blobName || "")}`;
  const sig = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("base64url");

  return { exp, sig };
}

function verifySignedAssetParams(blobName, exp, suppliedSignature) {
  const secret = getSigningSecret();
  const expiry = Number(exp);

  if (
    !secret ||
    !blobName ||
    !Number.isFinite(expiry) ||
    expiry <= Math.floor(Date.now() / 1000) ||
    !suppliedSignature
  ) {
    return false;
  }

  const message = `asset\n${expiry}\n${String(blobName)}`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("base64url");

  return timingSafeEqualText(
    suppliedSignature,
    expectedSignature
  );
}

function createBuilderToken(userCode) {
  const secret = getSigningSecret();

  if (!secret) {
    throw new Error(
      "BUILDER_SESSION_SECRET or BANK_SETUP_KEY is not configured"
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: String(userCode || "builder"),
    iat: now,
    exp: now + TOKEN_TTL_SECONDS
  };

  const encodedPayload = base64UrlEncode(
    JSON.stringify(payload)
  );

  const signature = signPayload(
    encodedPayload,
    secret
  );

  return `${encodedPayload}.${signature}`;
}

function verifyBuilderToken(token) {
  const secret = getSigningSecret();

  if (!secret || !token) {
    return null;
  }

  const parts = String(token).split(".");

  if (parts.length !== 2) {
    return null;
  }

  const [encodedPayload, suppliedSignature] = parts;
  const expectedSignature = signPayload(
    encodedPayload,
    secret
  );

  if (!timingSafeEqualText(
    suppliedSignature,
    expectedSignature
  )) {
    return null;
  }

  try {
    const payload = JSON.parse(
      base64UrlDecode(encodedPayload)
    );

    const now = Math.floor(Date.now() / 1000);

    if (!payload.exp || payload.exp <= now) {
      return null;
    }

    return payload;
  }
  catch {
    return null;
  }
}

function getBearerToken(request) {
  const customToken = String(
    request.headers.get("x-builder-token") || ""
  ).trim();

  if (customToken) {
    return customToken;
  }

  const header =
    request.headers.get("authorization") || "";

  const match =
    header.match(/^Bearer\s+(.+)$/i);

  return match ? match[1].trim() : "";
}

function requireBuilderAuth(request) {
  const token = getBearerToken(request);
  const payload = verifyBuilderToken(token);

  if (!payload) {
    return {
      ok: false,
      response: {
        status: 401,
        jsonBody: {
          ok: false,
          error: "Unauthorized"
        }
      }
    };
  }

  return {
    ok: true,
    user: payload
  };
}

function validateBuilderCredentials(userCode, password) {
  const configuredPassword = getBuilderPassword();
  const configuredUserCode = String(
    process.env.BUILDER_USER_CODE || ""
  ).trim();

  if (!configuredPassword) {
    throw new Error(
      "BUILDER_PASSWORD or BANK_SETUP_KEY is not configured"
    );
  }

  const normalizedUserCode = String(userCode || "").trim();

  if (!normalizedUserCode) {
    return false;
  }

  if (
    configuredUserCode &&
    normalizedUserCode !== configuredUserCode
  ) {
    return false;
  }

  return timingSafeEqualText(
    password,
    configuredPassword
  );
}

module.exports = {
  TOKEN_TTL_SECONDS,
  createBuilderToken,
  createSignedAssetParams,
  verifySignedAssetParams,
  requireBuilderAuth,
  validateBuilderCredentials
};



const crypto =
  require("crypto");

const STUDENT_TOKEN_TTL_SECONDS =
  12 * 60 * 60;

const PASSWORD_KEY_LENGTH = 64;

function getStudentSigningSecret() {
  return (
    process.env
      .STUDENT_SESSION_SECRET ||
    process.env
      .BUILDER_SESSION_SECRET ||
    process.env
      .BANK_SETUP_KEY ||
    ""
  );
}

function timingSafeEqualText(
  leftValue,
  rightValue
) {
  const left =
    Buffer.from(
      String(
        leftValue ||
        ""
      ),
      "utf8"
    );

  const right =
    Buffer.from(
      String(
        rightValue ||
        ""
      ),
      "utf8"
    );

  if (
    left.length !==
    right.length
  ) {
    return false;
  }

  return crypto
    .timingSafeEqual(
      left,
      right
    );
}

function normalizeStudentCode(
  value
) {
  return String(
    value ||
    ""
  )
    .normalize("NFKC")
    .trim()
    .toUpperCase();
}

function isValidStudentCode(
  value
) {
  const normalized =
    normalizeStudentCode(
      value
    );

  return (
    normalized.length >= 3 &&
    normalized.length <= 40 &&
    /^[A-Z0-9._-]+$/.test(
      normalized
    )
  );
}

function studentCodeHash(
  value
) {
  return crypto
    .createHash("sha256")
    .update(
      normalizeStudentCode(
        value
      )
    )
    .digest("hex");
}

function hashPassword(
  password,
  salt =
    crypto
      .randomBytes(16)
      .toString("base64")
) {
  const passwordText =
    String(
      password ||
      ""
    );

  if (
    passwordText.length <
    6
  ) {
    throw new Error(
      "Student password must contain at least 6 characters."
    );
  }

  const passwordHash =
    crypto
      .scryptSync(
        passwordText,
        salt,
        PASSWORD_KEY_LENGTH
      )
      .toString("base64");

  return {
    salt,
    passwordHash
  };
}

function verifyPassword(
  password,
  salt,
  expectedHash
) {
  try {
    const derived =
      crypto
        .scryptSync(
          String(
            password ||
            ""
          ),
          String(
            salt ||
            ""
          ),
          PASSWORD_KEY_LENGTH
        )
        .toString("base64");

    return timingSafeEqualText(
      derived,
      expectedHash
    );
  }
  catch {
    return false;
  }
}

function encodePayload(
  payload
) {
  return Buffer
    .from(
      JSON.stringify(
        payload
      ),
      "utf8"
    )
    .toString(
      "base64url"
    );
}

function decodePayload(
  encoded
) {
  return JSON.parse(
    Buffer
      .from(
        encoded,
        "base64url"
      )
      .toString("utf8")
  );
}

function signStudentPayload(
  encodedPayload,
  secret
) {
  return crypto
    .createHmac(
      "sha256",
      secret
    )
    .update(
      "student-session\n" +
      encodedPayload
    )
    .digest(
      "base64url"
    );
}

function createStudentToken(
  student
) {
  const secret =
    getStudentSigningSecret();

  if (!secret) {
    throw new Error(
      "STUDENT_SESSION_SECRET, BUILDER_SESSION_SECRET or BANK_SETUP_KEY is not configured."
    );
  }

  const now =
    Math.floor(
      Date.now() /
      1000
    );

  const payload = {
    sub:
      String(
        student.userId ||
        ""
      ),

    role:
      "student",

    code:
      String(
        student.code ||
        ""
      ),

    name:
      String(
        student.displayName ||
        ""
      ),

    classId:
      String(
        student.classId ||
        ""
      ),

    iat:
      now,

    exp:
      now +
      STUDENT_TOKEN_TTL_SECONDS
  };

  const encoded =
    encodePayload(
      payload
    );

  const signature =
    signStudentPayload(
      encoded,
      secret
    );

  return (
    encoded +
    "." +
    signature
  );
}

function verifyStudentToken(
  token
) {
  const secret =
    getStudentSigningSecret();

  if (
    !secret ||
    !token
  ) {
    return null;
  }

  const parts =
    String(
      token
    ).split(".");

  if (
    parts.length !==
    2
  ) {
    return null;
  }

  const [
    encoded,
    suppliedSignature
  ] = parts;

  const expectedSignature =
    signStudentPayload(
      encoded,
      secret
    );

  if (
    !timingSafeEqualText(
      suppliedSignature,
      expectedSignature
    )
  ) {
    return null;
  }

  try {
    const payload =
      decodePayload(
        encoded
      );

    const now =
      Math.floor(
        Date.now() /
        1000
      );

    if (
      payload.role !==
        "student" ||
      !payload.sub ||
      !payload.exp ||
      payload.exp <=
        now
    ) {
      return null;
    }

    return payload;
  }
  catch {
    return null;
  }
}

function getStudentToken(
  request
) {
  const customToken =
    String(
      request.headers.get(
        "x-student-token"
      ) ||
      request.headers.get(
        "x-platform-token"
      ) ||
      ""
    ).trim();

  if (customToken) {
    return customToken;
  }

  const authorization =
    String(
      request.headers.get(
        "authorization"
      ) ||
      ""
    );

  const match =
    authorization.match(
      /^Bearer\s+(.+)$/i
    );

  return match
    ? match[1].trim()
    : "";
}

function requireStudentAuth(
  request
) {
  const payload =
    verifyStudentToken(
      getStudentToken(
        request
      )
    );

  if (!payload) {
    return {
      ok: false,

      response: {
        status: 401,

        jsonBody: {
          ok: false,
          error:
            "Unauthorized"
        }
      }
    };
  }

  return {
    ok: true,
    user: payload
  };
}

function generateTemporaryPassword(
  length = 9
) {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZ" +
    "abcdefghijkmnopqrstuvwxyz" +
    "23456789";

  let result = "";

  const bytes =
    crypto.randomBytes(
      Math.max(
        8,
        length
      )
    );

  for (
    let index = 0;
    index < length;
    index += 1
  ) {
    result +=
      alphabet[
        bytes[index] %
        alphabet.length
      ];
  }

  return result;
}

module.exports = {
  STUDENT_TOKEN_TTL_SECONDS,
  normalizeStudentCode,
  isValidStudentCode,
  studentCodeHash,
  hashPassword,
  verifyPassword,
  createStudentToken,
  verifyStudentToken,
  requireStudentAuth,
  generateTemporaryPassword
};

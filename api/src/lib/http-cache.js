// Tadris+ P10-I — the platform-wide default cache policy for API responses (closes security review O12; design
// docs/enterprise-no-store-p10i.md, owner decision §19.46). Every JSON response (a `jsonBody`) that does not state its own
// Cache-Control gets `private, no-store`, so a student's answers, a teacher's saved exams or any other personal JSON never stays
// in a shared browser's cache after sign-out. A response that already states a Cache-Control (in any letter case) is never
// touched: content-addressed assets keep `public, max-age=31536000, immutable`, revalidated JSON keeps `private, no-cache` + Vary.
// A non-JSON response (`body`: an image, a file) is outside this rule and keeps whatever policy its route set.
//
// withObservability applies the rule to every response it returns; the routes that do not go through it are registered as
// `handler: withCachePolicy(...)`. The static guard api/tests/no-store-p10i.test.js fails CI when a registration uses neither.

const DEFAULT_JSON_CACHE_CONTROL = "private, no-store";

function hasCacheControl(headers) {
  if (!headers || typeof headers !== "object") return false;
  return Object.keys(headers).some(name => String(name).toLowerCase() === "cache-control");
}

/** Returns the response with `Cache-Control: private, no-store` added when it is JSON and states no Cache-Control of its own. */
function applyDefaultCachePolicy(response) {
  if (!response || typeof response !== "object") return response;
  if (response.jsonBody === undefined) return response;
  if (hasCacheControl(response.headers)) return response;
  const headers = response.headers && typeof response.headers === "object" ? response.headers : {};
  return { ...response, headers: { ...headers, "Cache-Control": DEFAULT_JSON_CACHE_CONTROL } };
}

/** Wraps a route handler so its response gets the default cache policy. Every argument passes through unchanged. */
function withCachePolicy(handler) {
  return async function cachePolicyHandler(...args) {
    return applyDefaultCachePolicy(await handler(...args));
  };
}

module.exports = { DEFAULT_JSON_CACHE_CONTROL, applyDefaultCachePolicy, withCachePolicy };

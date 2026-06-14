/**
 * HTTP method categorization utilities
 */

export const VALID_HTTP_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
] as const

export const GET_LIKE_METHODS = ["get", "delete", "head", "options"] as const

export const POST_LIKE_METHODS = ["post", "put", "patch"] as const

function includesString<T extends string>(values: readonly T[], value: string): value is T {
  return values.includes(value as T)
}

/**
 * Check if an HTTP method is valid
 */
export function isValidHttpMethod(method: string): boolean {
  return includesString(VALID_HTTP_METHODS, method.toLowerCase())
}

/**
 * Check if an HTTP method uses query parameters (GET-like)
 */
export function isGetLikeMethod(method: string): boolean {
  return includesString(GET_LIKE_METHODS, method.toLowerCase())
}

/**
 * Check if an HTTP method uses request body (POST-like)
 */
export function isPostLikeMethod(method: string): boolean {
  return includesString(POST_LIKE_METHODS, method.toLowerCase())
}

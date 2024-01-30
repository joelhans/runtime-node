import { isDeepStrictEqual } from "node:util";
import { isPlainObject } from "./isPlainObject";
import { tryDecodeAsJWT } from "./jwt";
import { Request } from "./RequestContext";
import { Source } from "./Source";

type DetectionResult =
  | { injection: true; source: Source; path: string }
  | { injection: false };

const COMPARISON_OPERATORS = [
  "$eq",
  "$gt",
  "$gte",
  "$in",
  "$lt",
  "$lte",
  "$ne",
  "$nin",
] as const;

type ComparisonOperator = (typeof COMPARISON_OPERATORS)[number];

function findValueInUserControllerValue(
  userControlledValue: unknown,
  filterPart: Record<string, unknown>,
  path = ""
): { path: string } | false {
  if (isDeepStrictEqual(userControlledValue, filterPart)) {
    return {
      path: path,
    };
  }

  // TODO: Perhaps do a length check here? For performance reasons
  if (typeof userControlledValue === "string") {
    let value = userControlledValue;

    if (value.toLowerCase().startsWith("bearer")) {
      const parts = value.split(" ");
      if (parts.length === 2) {
        value = parts[1];
      }
    }

    const jwt = tryDecodeAsJWT(value);
    if (jwt && findValueInUserControllerValue(jwt, filterPart)) {
      return {
        path: path,
      };
    }
  }

  if (isPlainObject(userControlledValue)) {
    const fields = Object.keys(userControlledValue);
    for (const field of fields) {
      const result = findValueInUserControllerValue(
        userControlledValue[field],
        filterPart,
        `${path}.${field}`
      );

      if (result) {
        return {
          path: result.path,
        };
      }
    }
  }

  return false;
}

function findInjectionInObject(
  userControlledValue: unknown,
  filter: unknown
): { path: string } | false {
  if (!isPlainObject(filter)) {
    return false;
  }

  const fields = Object.keys(filter);
  for (const field of fields) {
    const value = filter[field];

    if (field === "$and" || field === "$or" || field === "$nor") {
      if (!Array.isArray(value)) {
        continue;
      }

      for (const v of value) {
        const result = findInjectionInObject(userControlledValue, v);

        if (result) {
          return {
            path: result.path,
          };
        }
      }

      continue;
    }

    if (field === "$not") {
      const result = findInjectionInObject(userControlledValue, value);

      if (result) {
        return {
          path: result.path,
        };
      }

      continue;
    }

    if (
      isPlainObject(value) &&
      Object.keys(value).length === 1 &&
      COMPARISON_OPERATORS.includes(Object.keys(value)[0] as ComparisonOperator)
    ) {
      const result = findValueInUserControllerValue(userControlledValue, value);

      if (result) {
        return {
          path: result.path,
        };
      }
    }
  }

  return false;
}

// TODO: Parse the filters once for performance reasons
export function detectNoSQLInjection(
  request: Request,
  filter: unknown
): DetectionResult {
  const body = findInjectionInObject(request.body, filter);

  if (body) {
    return {
      injection: true,
      source: "body",
      path: body.path,
    };
  }

  const query = findInjectionInObject(request.query, filter);

  if (query) {
    return {
      injection: true,
      source: "query",
      path: query.path.startsWith(".") ? query.path.slice(1) : query.path,
    };
  }

  const headers = findInjectionInObject(request.headers, filter);

  if (headers) {
    return {
      injection: true,
      source: "headers",
      path: headers.path.startsWith(".") ? headers.path.slice(1) : headers.path,
    };
  }

  const cookies = findInjectionInObject(request.cookies, filter);

  if (cookies) {
    return {
      injection: true,
      source: "cookies",
      path: cookies.path.startsWith(".") ? cookies.path.slice(1) : cookies.path,
    };
  }

  return { injection: false };
}

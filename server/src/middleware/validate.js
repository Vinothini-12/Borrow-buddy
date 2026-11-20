import { badRequest } from '../utils/httpError.js';

function formatIssues(error) {
  return error.issues
    .map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
    .join('; ');
}

// Parses req[source] with a zod schema and replaces it with the parsed (trimmed, coerced) value.
// Express 5 makes req.query a getter, so parsed query values go on req.validatedQuery instead.
export const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source] ?? {});
  if (!result.success) return next(badRequest(formatIssues(result.error)));
  if (source === 'query') req.validatedQuery = result.data;
  else req[source] = result.data;
  next();
};

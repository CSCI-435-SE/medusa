import { FieldErrors, FieldValues, Resolver } from "react-hook-form"
import { z } from "zod"

/*
 * A react-hook-form resolver for zod 4 schemas.
 *
 * `@hookform/resolvers@3.4.2`, which the dashboard pins, was written for zod 3:
 * it reads `ZodError.errors`, a property zod 4 renamed to `issues`. Instead of
 * returning the errors it rethrows the ZodError, so `formState.errors` stays
 * empty and `<Form.ErrorMessage />` has nothing to render. Every form that
 * calls `zodResolver` silently refuses to submit rather than saying what is
 * wrong.
 *
 * Bundle forms need inline validation messages (issue #114, AC 3), so they use
 * this resolver instead. It is a drop-in replacement for `zodResolver`:
 * validate with the schema, and shape the issues the way react-hook-form reads
 * them. Fixing the rest of the dashboard means upgrading the dependency, which
 * is out of scope here (see the Tech Debt section of the PR).
 */

type FieldError = { type: string; message: string }

/**
 * Turns zod issues into the nested object react-hook-form looks field errors up
 * in: `{ components: { 0: { quantity: { type, message } } } }`.
 *
 * An issue whose path is the array itself (for example "at least 2 components")
 * is written onto the array node, next to any index keys, because that is where
 * `Form.ErrorMessage` for a field named `components` reads it.
 *
 * The first issue for a path wins, matching how `zodResolver` behaves without
 * `criteriaMode: "all"`.
 */
const toFieldErrors = <TFieldValues extends FieldValues>(
  issues: z.core.$ZodIssue[]
): FieldErrors<TFieldValues> => {
  const errors: Record<string, any> = {}

  for (const issue of issues) {
    // An issue with an empty path belongs to the whole object. There is no
    // field to attach it to, so react-hook-form's own convention is used.
    const path = issue.path.length ? issue.path.map(String) : ["root"]

    let node = errors
    for (const key of path.slice(0, -1)) {
      if (
        typeof node[key] !== "object" ||
        node[key] === null ||
        Array.isArray(node[key])
      ) {
        node[key] = {}
      }
      node = node[key]
    }

    const leaf = path[path.length - 1]
    const error: FieldError = { type: issue.code, message: issue.message }

    if (node[leaf] === undefined) {
      node[leaf] = error
      continue
    }

    // Something already sits here. A branch (an array or object with issues of
    // its own) keeps its children and gains the message; a leaf keeps the first
    // message it was given.
    if (node[leaf].message === undefined) {
      Object.assign(node[leaf], error)
    }
  }

  return errors as FieldErrors<TFieldValues>
}

/**
 * Builds a react-hook-form resolver from a zod schema.
 *
 * The form's value type is given by the caller (`useForm<T>` already names it),
 * because a zod schema's input type is not narrowed to `FieldValues`.
 *
 * @param schema - the schema the form values are validated against
 */
export const zodFormResolver =
  <TFieldValues extends FieldValues>(
    schema: z.ZodType
  ): Resolver<TFieldValues> =>
  async (values) => {
    const result = await schema.safeParseAsync(values)

    if (result.success) {
      return { values: result.data as TFieldValues, errors: {} }
    }

    return {
      values: {},
      errors: toFieldErrors<TFieldValues>(result.error.issues),
    }
  }

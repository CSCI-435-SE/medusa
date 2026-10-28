// @vitest-environment jsdom
import { RouteObject } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

// The route map imports layouts that pull in the SDK client, which reads these
// bare globals at module load time (see edit-product-form.spec.tsx); Vite
// injects them in the real app.
vi.hoisted(() => {
  const g = global as any
  g.__BACKEND_URL__ = "http://localhost:9000"
  g.__AUTH_TYPE__ = "session"
  g.__JWT_TOKEN_STORAGE_KEY__ = ""
})

import { getRouteMap } from "./get-route.map"

/**
 * Returns the first route in the tree whose `path` equals `path`.
 */
const findRoute = (
  routes: RouteObject[],
  path: string
): RouteObject | undefined => {
  for (const route of routes) {
    if (route.path === path) {
      return route
    }

    const found = findRoute(route.children ?? [], path)

    if (found) {
      return found
    }
  }
}

/**
 * The child routes of the product detail page: /products -> :id -> "".
 * Paths like "edit" are used all over the app, so the lookup is scoped here.
 */
const getProductDetailChildren = () => {
  const routes = getRouteMap({ settingsRoutes: [], coreRoutes: [] })

  const products = findRoute(routes, "/products")
  const productId = findRoute(products?.children ?? [], ":id")
  const detail = findRoute(productId?.children ?? [], "")

  return detail?.children ?? []
}

describe("getRouteMap product detail routes", () => {
  // Guards against a bad merge collapsing two child routes into one object
  // (a duplicate `path`/`lazy` key means the last one silently wins, and the
  // other route stops existing).
  it.each(["edit", "duplicate", "edit-all"])(
    "registers /products/:id/%s as its own lazy route",
    (path) => {
      const matches = getProductDetailChildren().filter(
        (route) => route.path === path
      )

      expect(matches).toHaveLength(1)
      expect(matches[0].lazy).toBeTypeOf("function")
    }
  )

  it("keeps duplicate and edit-all as separate sibling routes", () => {
    const children = getProductDetailChildren()
    const duplicate = children.find((route) => route.path === "duplicate")
    const editAll = children.find((route) => route.path === "edit-all")

    expect(duplicate).toBeDefined()
    expect(editAll).toBeDefined()
    expect(duplicate).not.toBe(editAll)
  })
})

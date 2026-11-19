import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import {
  buildInsufficientInventoryError,
  findShortReservationItems,
  formatInsufficientInventoryMessage,
  getVariantDisplayName,
  NamedVariant,
  resolveInventoryShortages,
} from "../insufficient-inventory-error"

const kit: NamedVariant = {
  id: "variant_kit",
  title: "Default",
  product: {
    title: "Camera kit",
    variants: [{ id: "variant_kit" }],
    metadata: {
      bundle: {
        components: [
          { variant_id: "variant_camera", quantity: 1 },
          { variant_id: "variant_lens", quantity: 1 },
          { variant_id: "variant_bag", quantity: 1 },
        ],
      },
    },
  },
  inventory_items: [
    { inventory_item_id: "ii_camera" },
    { inventory_item_id: "ii_lens" },
    { inventory_item_id: "ii_bag" },
  ],
}

const component = (id: string, title: string, item: string): NamedVariant => ({
  id,
  title: "Default",
  product: { title, variants: [{ id }], metadata: {} },
  inventory_items: [{ inventory_item_id: item }],
})

const camera = component("variant_camera", "Camera body", "ii_camera")
const lens = component("variant_lens", "Lens", "ii_lens")
const bag = component("variant_bag", "Bag", "ii_bag")

const shirtLarge: NamedVariant = {
  id: "variant_shirt_l",
  title: "L",
  product: {
    title: "T-shirt",
    variants: [{ id: "variant_shirt_s" }, { id: "variant_shirt_l" }],
    metadata: null,
  },
  inventory_items: [{ inventory_item_id: "ii_shirt_l" }],
}

const allVariants = [kit, camera, lens, bag, shirtLarge]

describe("getVariantDisplayName", () => {
  it("uses the product title for a product with one variant", () => {
    expect(getVariantDisplayName(lens)).toEqual("Lens")
  })

  it("adds the variant title when the product has several variants", () => {
    expect(getVariantDisplayName(shirtLarge)).toEqual("T-shirt (L)")
  })

  it("doesn't repeat a variant title that equals the product title", () => {
    expect(
      getVariantDisplayName({
        id: "v",
        title: "Mug",
        product: { title: "Mug", variants: [{ id: "v" }, { id: "w" }] },
      })
    ).toEqual("Mug")
  })

  it("uses the product title when the product's variants weren't loaded", () => {
    expect(
      getVariantDisplayName({
        id: "v",
        title: "Black",
        product: { title: "Lens" },
      })
    ).toEqual("Lens")
  })

  it("falls back to the variant title, then the ID", () => {
    expect(getVariantDisplayName({ id: "v", title: "Blue" })).toEqual("Blue")
    expect(getVariantDisplayName({ id: "v" })).toEqual("v")
  })
})

describe("resolveInventoryShortages", () => {
  it("names the out-of-stock component and its bundle (AC 1)", () => {
    expect(
      resolveInventoryShortages(
        [{ inventory_item_id: "ii_lens", variant_id: "variant_kit" }],
        allVariants
      )
    ).toEqual([{ bundle: "Camera kit", name: "Lens" }])
  })

  it("names every out-of-stock component (AC 2)", () => {
    expect(
      resolveInventoryShortages(
        [
          { inventory_item_id: "ii_lens", variant_id: "variant_kit" },
          { inventory_item_id: "ii_bag", variant_id: "variant_kit" },
        ],
        allVariants
      )
    ).toEqual([
      { bundle: "Camera kit", name: "Lens" },
      { bundle: "Camera kit", name: "Bag" },
    ])
  })

  it("names the variant of an item that isn't a bundle (AC 3)", () => {
    expect(
      resolveInventoryShortages(
        [{ inventory_item_id: "ii_shirt_l", variant_id: "variant_shirt_l" }],
        allVariants
      )
    ).toEqual([{ name: "T-shirt (L)" }])
  })

  it("lists the same component once per bundle it's short in", () => {
    const otherKit: NamedVariant = {
      ...kit,
      id: "variant_kit2",
      product: { ...kit.product!, title: "Vlog kit" },
    }

    expect(
      resolveInventoryShortages(
        [
          { inventory_item_id: "ii_lens", variant_id: "variant_kit" },
          { inventory_item_id: "ii_lens", variant_id: "variant_kit2" },
        ],
        [...allVariants, otherKit]
      )
    ).toEqual([
      { bundle: "Camera kit", name: "Lens" },
      { bundle: "Vlog kit", name: "Lens" },
    ])
  })

  it("lists a shortage once when several lines report it", () => {
    expect(
      resolveInventoryShortages(
        [
          { inventory_item_id: "ii_lens", variant_id: "variant_kit" },
          { inventory_item_id: "ii_lens", variant_id: "variant_kit" },
        ],
        allVariants
      )
    ).toEqual([{ bundle: "Camera kit", name: "Lens" }])
  })

  it("names the bundle when no current component uses the inventory item", () => {
    expect(
      resolveInventoryShortages(
        [{ inventory_item_id: "ii_removed", variant_id: "variant_kit" }],
        allVariants
      )
    ).toEqual([{ name: "Camera kit" }])
  })

  it("skips lines whose variant is unknown", () => {
    expect(
      resolveInventoryShortages(
        [
          { inventory_item_id: "ii_x", variant_id: "variant_unknown" },
          { inventory_item_id: "ii_y" },
        ],
        allVariants
      )
    ).toEqual([])
  })
})

describe("formatInsufficientInventoryMessage", () => {
  it("names the bundle and its out-of-stock component", () => {
    expect(
      formatInsufficientInventoryMessage([
        { bundle: "Camera kit", name: "Lens" },
      ])
    ).toEqual("Camera kit: Lens is out of stock.")
  })

  it("lists several components of one bundle together", () => {
    expect(
      formatInsufficientInventoryMessage([
        { bundle: "Camera kit", name: "Lens" },
        { bundle: "Camera kit", name: "Bag" },
      ])
    ).toEqual("Camera kit: Lens, Bag are out of stock.")
  })

  it("names products that aren't bundles one by one", () => {
    expect(
      formatInsufficientInventoryMessage([
        { name: "T-shirt (L)" },
        { name: "Mug" },
        { bundle: "Camera kit", name: "Lens" },
      ])
    ).toEqual(
      "T-shirt (L) is out of stock. Mug is out of stock. Camera kit: Lens is out of stock."
    )
  })

  it("keeps the old generic message when nothing could be named", () => {
    expect(formatInsufficientInventoryMessage([])).toEqual(
      "Some variant does not have the required inventory"
    )
  })
})

describe("buildInsufficientInventoryError", () => {
  const containerWith = (graph: jest.Mock) =>
    ({
      resolve: (key: string) =>
        key === ContainerRegistrationKeys.QUERY ? { graph } : undefined,
    } as any)

  it("loads the bundle and its components, and names the short component", async () => {
    const graph = jest
      .fn()
      .mockResolvedValueOnce({ data: [kit] })
      .mockResolvedValueOnce({ data: [camera, lens, bag] })

    const error = await buildInsufficientInventoryError(containerWith(graph), [
      { inventory_item_id: "ii_lens", variant_id: "variant_kit" },
    ])

    expect(error).toBeInstanceOf(MedusaError)
    expect(error.message).toEqual("Camera kit: Lens is out of stock.")
    expect(error.type).toEqual(MedusaError.Types.NOT_ALLOWED)
    expect(error.code).toEqual(MedusaError.Codes.INSUFFICIENT_INVENTORY)
    // The fields every name needs: titles, the bundle marker in the product
    // metadata, the product's variant count and the inventory links.
    const fields = [
      "id",
      "title",
      "product.title",
      "product.metadata",
      "product.variants.id",
      "inventory_items.inventory_item_id",
    ]
    expect(graph).toHaveBeenNthCalledWith(1, {
      entity: "variant",
      fields,
      filters: { id: ["variant_kit"] },
    })
    expect(graph).toHaveBeenNthCalledWith(2, {
      entity: "variant",
      fields,
      filters: { id: ["variant_camera", "variant_lens", "variant_bag"] },
    })
  })

  it("loads each line variant once and skips components that are also lines", async () => {
    const graph = jest
      .fn()
      .mockResolvedValueOnce({ data: [kit, lens] })
      .mockResolvedValueOnce({ data: [camera, bag] })

    const error = await buildInsufficientInventoryError(containerWith(graph), [
      { inventory_item_id: "ii_lens", variant_id: "variant_kit" },
      { inventory_item_id: "ii_lens", variant_id: "variant_lens" },
      { inventory_item_id: "ii_lens", variant_id: "variant_lens" },
    ])

    expect(graph).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        filters: { id: ["variant_kit", "variant_lens"] },
      })
    )
    expect(graph).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        filters: { id: ["variant_camera", "variant_bag"] },
      })
    )
    expect(error.message).toEqual(
      "Camera kit: Lens is out of stock. Lens is out of stock."
    )
  })

  it("doesn't query components when no line is a bundle", async () => {
    const graph = jest.fn().mockResolvedValueOnce({ data: [shirtLarge] })

    const error = await buildInsufficientInventoryError(containerWith(graph), [
      { inventory_item_id: "ii_shirt_l", variant_id: "variant_shirt_l" },
    ])

    expect(graph).toHaveBeenCalledTimes(1)
    expect(error.message).toEqual("T-shirt (L) is out of stock.")
  })

  it("keeps the generic message when lines have no variant", async () => {
    const graph = jest.fn()

    const error = await buildInsufficientInventoryError(containerWith(graph), [
      { inventory_item_id: "ii_x" },
    ])

    expect(graph).not.toHaveBeenCalled()
    expect(error.message).toEqual(
      "Some variant does not have the required inventory"
    )
  })
})

describe("findShortReservationItems", () => {
  const containerWithStock = (stock: Record<string, number>) => {
    const confirmInventory = jest.fn(
      async (itemId: string, locationIds: string[], quantity: number) =>
        Number(quantity) <= (stock[`${itemId}@${locationIds[0] ?? ""}`] ?? 0)
    )
    return {
      container: {
        resolve: (key: string) =>
          key === Modules.INVENTORY ? { confirmInventory } : undefined,
      } as any,
      confirmInventory,
    }
  }

  it("adds up lines that use the same item at the same location", async () => {
    const { container, confirmInventory } = containerWithStock({
      "ii_lens@loc_1": 1,
    })
    const bundleLine = {
      inventory_item_id: "ii_lens",
      location_id: "loc_1",
      quantity: 1,
      variant_id: "variant_kit",
    }
    const lensLine = { ...bundleLine, variant_id: "variant_lens" }

    const short = await findShortReservationItems(container, [
      bundleLine,
      lensLine,
    ])

    expect(short).toEqual([bundleLine, lensLine])
    expect(confirmInventory).toHaveBeenCalledTimes(1)
    expect(confirmInventory.mock.calls[0][0]).toEqual("ii_lens")
    expect(confirmInventory.mock.calls[0][1]).toEqual(["loc_1"])
    expect(Number(confirmInventory.mock.calls[0][2])).toEqual(2)
  })

  it("checks each location on its own and returns only short lines", async () => {
    const { container } = containerWithStock({
      "ii_lens@loc_1": 1,
      "ii_lens@loc_2": 5,
      "ii_bag@loc_1": 0,
    })
    const items = [
      { inventory_item_id: "ii_lens", location_id: "loc_1", quantity: 1 },
      { inventory_item_id: "ii_lens", location_id: "loc_2", quantity: 3 },
      { inventory_item_id: "ii_bag", location_id: "loc_1", quantity: 1 },
    ]

    expect(await findShortReservationItems(container, items)).toEqual([
      items[2],
    ])
  })

  it("never reports backordered lines", async () => {
    const { container, confirmInventory } = containerWithStock({})
    const items = [
      {
        inventory_item_id: "ii_lens",
        location_id: "loc_1",
        quantity: 1,
        allow_backorder: true,
      },
    ]

    expect(await findShortReservationItems(container, items)).toEqual([])
    expect(confirmInventory).not.toHaveBeenCalled()
  })

  it("checks lines without a location against no location", async () => {
    const { container, confirmInventory } = containerWithStock({})

    await findShortReservationItems(container, [
      { inventory_item_id: "ii_lens", quantity: 1 },
    ])

    expect(confirmInventory.mock.calls[0][1]).toEqual([])
  })
})

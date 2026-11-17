import {
  BUNDLE_COMPONENT_METADATA_KEY,
  OrderBundleComponent,
  allocateComponentRefund,
  bundleReturnItemKey,
  computeBundleRefundShares,
  getComponentRestockAdjustments,
  getOrderBundleComponents,
  getReturnedBundleComponent,
  prepareBundleReceiveItems,
  prepareBundleReturnItems,
  withoutBundleComponentMetadata,
} from "../bundle-refunds"

// The issue's scenario: camera 800, lens 300, bag 100, kit sold for 1000.
const cameraKit = (overrides: Partial<{ camera: number | null }> = {}) => [
  {
    variant_id: "camera",
    title: "Camera",
    quantity: 1,
    unit_price: "camera" in overrides ? overrides.camera : 800,
    inventory_items: [{ inventory_item_id: "ii_camera", required_quantity: 1 }],
  },
  {
    variant_id: "lens",
    title: "Lens",
    quantity: 1,
    unit_price: 300,
    inventory_items: [{ inventory_item_id: "ii_lens", required_quantity: 1 }],
  },
  {
    variant_id: "bag",
    title: "Bag",
    quantity: 1,
    unit_price: 100,
    inventory_items: [{ inventory_item_id: "ii_bag", required_quantity: 1 }],
  },
]

const sharesOf = (components: OrderBundleComponent[]) =>
  Object.fromEntries(components.map((c) => [c.variant_id, c.refund_share]))

const sum = (values: number[]) =>
  Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100

describe("computeBundleRefundShares", () => {
  it("splits the price paid by normal price (AC 7, issue scenario)", () => {
    const result = computeBundleRefundShares({
      components: cameraKit(),
      lineQuantity: 1,
      amountPaid: 1000,
      precision: 2,
    })

    expect(sharesOf(result)).toEqual({
      camera: 666.67,
      lens: 250,
      bag: 83.33,
    })
  })

  it("adds up exactly to the price paid after rounding (AC 9)", () => {
    for (const amountPaid of [1000, 899, 0.01, 0.02, 1234.56, 100]) {
      const result = computeBundleRefundShares({
        components: cameraKit(),
        lineQuantity: 1,
        amountPaid,
        precision: 2,
      })
      expect(sum(result.map((c) => c.refund_share))).toEqual(amountPaid)
    }
  })

  it("gives leftover cents to the largest remainders, the earlier component on a tie (AC 9)", () => {
    // 1.00 split three ways: 0.333... each. One cent left, all remainders
    // equal, so the first component gets it.
    const result = computeBundleRefundShares({
      components: [
        {
          variant_id: "a",
          title: "A",
          quantity: 1,
          unit_price: 5,
          inventory_items: [],
        },
        {
          variant_id: "b",
          title: "B",
          quantity: 1,
          unit_price: 5,
          inventory_items: [],
        },
        {
          variant_id: "c",
          title: "C",
          quantity: 1,
          unit_price: 5,
          inventory_items: [],
        },
      ],
      lineQuantity: 1,
      amountPaid: 1,
      precision: 2,
    })

    expect(sharesOf(result)).toEqual({ a: 0.34, b: 0.33, c: 0.33 })
  })

  it("gives several leftover cents one each, largest remainder first", () => {
    // 0.10 by weights 1:1:1:4 -> 0.0142..., 0.0142..., 0.0142..., 0.0571...
    // floors 0.01,0.01,0.01,0.05 (0.08); two cents left go to the largest
    // remainders: d (0.0071) then a (0.0042, first of the tied ones).
    const result = computeBundleRefundShares({
      components: ["a", "b", "c", "d"].map((id) => ({
        variant_id: id,
        title: id,
        quantity: 1,
        unit_price: id === "d" ? 4 : 1,
        inventory_items: [],
      })),
      lineQuantity: 1,
      amountPaid: 0.1,
      precision: 2,
    })

    expect(sharesOf(result)).toEqual({ a: 0.02, b: 0.01, c: 0.01, d: 0.06 })
  })

  it("weights by component quantity and counts units for every bundle on the line", () => {
    // 2 lenses at 300 + 1 bag at 100: lens weight 600, bag 100.
    const result = computeBundleRefundShares({
      components: [
        {
          variant_id: "lens",
          title: "Lens",
          quantity: 2,
          unit_price: 300,
          inventory_items: [],
        },
        {
          variant_id: "bag",
          title: "Bag",
          quantity: 1,
          unit_price: 100,
          inventory_items: [],
        },
      ],
      lineQuantity: 3,
      amountPaid: 2100,
      precision: 2,
    })

    expect(result).toEqual([
      expect.objectContaining({
        variant_id: "lens",
        quantity: 2,
        units: 6,
        refund_share: 1800,
      }),
      expect.objectContaining({
        variant_id: "bag",
        quantity: 1,
        units: 3,
        refund_share: 300,
      }),
    ])
  })

  it("gives a free component no share when the others have prices (AC 7)", () => {
    const result = computeBundleRefundShares({
      components: [
        {
          variant_id: "camera",
          title: "Camera",
          quantity: 1,
          unit_price: 800,
          inventory_items: [],
        },
        {
          variant_id: "strap",
          title: "Strap",
          quantity: 1,
          unit_price: 0,
          inventory_items: [],
        },
      ],
      lineQuantity: 1,
      amountPaid: 500,
      precision: 2,
    })

    expect(sharesOf(result)).toEqual({ camera: 500, strap: 0 })
  })

  it("gives the leftover cent to the larger remainder, not the larger share (AC 9)", () => {
    // 0.02 by weights 1:2: exact shares 0.00667 and 0.01333. Rounded down:
    // 0.00 and 0.01; the cent left goes to the first (remainder 0.667 cent
    // against 0.333 cent).
    const result = computeBundleRefundShares({
      components: [
        {
          variant_id: "a",
          title: "A",
          quantity: 1,
          unit_price: 1,
          inventory_items: [],
        },
        {
          variant_id: "b",
          title: "B",
          quantity: 1,
          unit_price: 2,
          inventory_items: [],
        },
      ],
      lineQuantity: 1,
      amountPaid: 0.02,
      precision: 2,
    })

    expect(sharesOf(result)).toEqual({ a: 0.01, b: 0.01 })
  })

  it("splits by quantity when a component has no price in the order's currency (AC 12)", () => {
    const result = computeBundleRefundShares({
      components: cameraKit({ camera: null }),
      lineQuantity: 1,
      amountPaid: 900,
      precision: 2,
    })

    expect(sharesOf(result)).toEqual({ camera: 300, lens: 300, bag: 300 })
  })

  it("splits by quantity when every price is 0", () => {
    const result = computeBundleRefundShares({
      components: [
        {
          variant_id: "a",
          title: "A",
          quantity: 1,
          unit_price: 0,
          inventory_items: [],
        },
        {
          variant_id: "b",
          title: "B",
          quantity: 3,
          unit_price: 0,
          inventory_items: [],
        },
      ],
      lineQuantity: 1,
      amountPaid: 100,
      precision: 2,
    })

    expect(sharesOf(result)).toEqual({ a: 25, b: 75 })
  })

  it("uses the currency's precision (no decimals for JPY)", () => {
    const result = computeBundleRefundShares({
      components: cameraKit(),
      lineQuantity: 1,
      amountPaid: 1000,
      precision: 0,
    })

    expect(sharesOf(result)).toEqual({ camera: 667, lens: 250, bag: 83 })
  })

  it("keeps the component's title and inventory links for restocking", () => {
    const [camera] = computeBundleRefundShares({
      components: cameraKit(),
      lineQuantity: 1,
      amountPaid: 1000,
      precision: 2,
    })

    expect(camera).toEqual({
      variant_id: "camera",
      title: "Camera",
      quantity: 1,
      units: 1,
      refund_share: 666.67,
      inventory_items: [
        { inventory_item_id: "ii_camera", required_quantity: 1 },
      ],
    })
  })

  it("gives every component 0 when nothing was paid", () => {
    const result = computeBundleRefundShares({
      components: cameraKit(),
      lineQuantity: 1,
      amountPaid: 0,
      precision: 2,
    })

    expect(sharesOf(result)).toEqual({ camera: 0, lens: 0, bag: 0 })
  })
})

describe("allocateComponentRefund", () => {
  it("refunds share x quantity / units when the split is even (AC 14)", () => {
    expect(
      allocateComponentRefund({
        share: 300,
        units: 3,
        previousUnits: 0,
        quantity: 1,
        precision: 2,
      })
    ).toEqual(100)
  })

  it("refunds the whole share for every unit", () => {
    expect(
      allocateComponentRefund({
        share: 83.33,
        units: 1,
        previousUnits: 0,
        quantity: 1,
        precision: 2,
      })
    ).toEqual(83.33)
  })

  it("adds up exactly to the share over several partial returns (AC 16)", () => {
    // 100.00 over 3 units: 33.33 + 33.33 + 33.34
    const refunds = [0, 1, 2].map((previousUnits) =>
      allocateComponentRefund({
        share: 100,
        units: 3,
        previousUnits,
        quantity: 1,
        precision: 2,
      })
    )

    expect(refunds).toEqual([33.33, 33.33, 33.34])
    expect(sum(refunds)).toEqual(100)
  })

  it("returning several units at once refunds the same as one by one", () => {
    expect(
      allocateComponentRefund({
        share: 100,
        units: 3,
        previousUnits: 1,
        quantity: 2,
        precision: 2,
      })
    ).toEqual(66.67)
  })
})

describe("getOrderBundleComponents / getReturnedBundleComponent", () => {
  it("reads saved components, and ignores lines without saved shares", () => {
    const components = [{ variant_id: "a", refund_share: 1 }]
    expect(getOrderBundleComponents({ bundle: { components } })).toBe(
      components
    )
    // Ordered before shares were saved (bundle marker without shares).
    expect(
      getOrderBundleComponents({
        bundle: { components: [{ variant_id: "a" }] },
      })
    ).toBeNull()
    expect(getOrderBundleComponents({ bundle: {} })).toBeNull()
    expect(getOrderBundleComponents(null)).toBeNull()
  })

  it("reads the returned component from metadata", () => {
    const component = { variant_id: "bag", title: "Bag", amount: 83.33 }
    expect(getReturnedBundleComponent({ bundle_component: component })).toBe(
      component
    )
    expect(getReturnedBundleComponent({ bundle_component: {} })).toBeNull()
    expect(getReturnedBundleComponent(undefined)).toBeNull()
  })
})

const savedKit = computeBundleRefundShares({
  components: cameraKit(),
  lineQuantity: 1,
  amountPaid: 1000,
  precision: 2,
})

const kitLine = (overrides: Record<string, unknown> = {}) => ({
  id: "item_kit",
  title: "Camera kit",
  quantity: 1,
  fulfilled_quantity: 1,
  return_requested_quantity: 0,
  return_received_quantity: 0,
  return_dismissed_quantity: 0,
  metadata: { bundle: { components: savedKit } },
  ...overrides,
})

const shirtLine = {
  id: "item_shirt",
  title: "Shirt",
  quantity: 1,
  fulfilled_quantity: 1,
  metadata: {},
}

describe("prepareBundleReturnItems", () => {
  it("names the returned component and its refund (AC 13, 14)", () => {
    const [item] = prepareBundleReturnItems({
      items: [{ id: "item_kit", quantity: 1, component_variant_id: "bag" }],
      orderItems: [kitLine()],
      existingReturns: [],
      precision: 2,
    })

    expect(item).toEqual({
      id: "item_kit",
      quantity: 1,
      metadata: {
        [BUNDLE_COMPONENT_METADATA_KEY]: {
          variant_id: "bag",
          title: "Bag",
          amount: 83.33,
        },
      },
    })
  })

  it("keeps the client's metadata and other fields", () => {
    const [item] = prepareBundleReturnItems({
      items: [
        {
          id: "item_kit",
          quantity: 1,
          component_variant_id: "bag",
          metadata: { note: "scratched" },
          reason_id: "rr_1",
        } as any,
      ],
      orderItems: [kitLine()],
      existingReturns: [],
      precision: 2,
    })

    expect(item).toEqual(
      expect.objectContaining({
        reason_id: "rr_1",
        metadata: expect.objectContaining({ note: "scratched" }),
      })
    )
  })

  it("refunds exactly the bundle price once every component is returned (AC 16)", () => {
    const items = prepareBundleReturnItems({
      items: ["camera", "lens", "bag"].map((id) => ({
        id: "item_kit",
        quantity: 1,
        component_variant_id: id,
      })),
      orderItems: [kitLine()],
      existingReturns: [],
      precision: 2,
    })

    expect(
      sum(
        items.map(
          (item) => item.metadata![BUNDLE_COMPONENT_METADATA_KEY].amount
        )
      )
    ).toEqual(1000)
  })

  it("ignores a refund amount sent by the client in metadata", () => {
    const forged = {
      bundle_component: { variant_id: "bag", title: "Bag", amount: 99999 },
      note: "kept",
    }

    expect(
      prepareBundleReturnItems({
        items: [{ id: "item_kit", quantity: 1, metadata: forged }],
        orderItems: [kitLine()],
        existingReturns: [],
        precision: 2,
      })
    ).toEqual([{ id: "item_kit", quantity: 1, metadata: { note: "kept" } }])

    const [component] = prepareBundleReturnItems({
      items: [
        {
          id: "item_kit",
          quantity: 1,
          component_variant_id: "bag",
          metadata: forged,
        },
      ],
      orderItems: [kitLine()],
      existingReturns: [],
      precision: 2,
    })
    expect(component.metadata!.bundle_component.amount).toEqual(83.33)
  })

  it("leaves items of normal lines unchanged", () => {
    const items = [{ id: "item_shirt", quantity: 1, reason_id: "rr_1" }]
    expect(
      prepareBundleReturnItems({
        items,
        orderItems: [shirtLine, kitLine()],
        existingReturns: [],
        precision: 2,
      })
    ).toEqual(items)
  })

  it("leaves items of unknown lines unchanged for the order checks to reject", () => {
    const items = [
      { id: "item_missing", quantity: 1, component_variant_id: "bag" },
    ]
    expect(
      prepareBundleReturnItems({
        items,
        orderItems: [kitLine()],
        existingReturns: [],
        precision: 2,
      })
    ).toEqual([{ id: "item_missing", quantity: 1 }])
  })

  it("allows a whole-bundle return when no component was returned (AC 17)", () => {
    expect(
      prepareBundleReturnItems({
        items: [{ id: "item_kit", quantity: 1 }],
        orderItems: [kitLine()],
        existingReturns: [],
        precision: 2,
      })
    ).toEqual([{ id: "item_kit", quantity: 1 }])
  })

  it("rejects a whole-bundle return after one of its components was returned", () => {
    expect(() =>
      prepareBundleReturnItems({
        items: [{ id: "item_kit", quantity: 1 }],
        orderItems: [kitLine()],
        existingReturns: [
          {
            item_id: "item_kit",
            quantity: 1,
            metadata: {
              bundle_component: {
                variant_id: "bag",
                title: "Bag",
                amount: 83.33,
              },
            },
          },
        ],
        precision: 2,
      })
    ).toThrow(
      'Cannot return 1 of the bundle "Camera kit": only 0 can be returned whole, because items of the other bundles were already returned. Return the remaining items individually instead.'
    )
  })

  it("still allows whole returns of the other bundles on the line", () => {
    expect(
      prepareBundleReturnItems({
        items: [{ id: "item_kit", quantity: 1 }],
        orderItems: [
          kitLine({
            quantity: 2,
            fulfilled_quantity: 2,
            metadata: {
              bundle: {
                components: computeBundleRefundShares({
                  components: cameraKit(),
                  lineQuantity: 2,
                  amountPaid: 2000,
                  precision: 2,
                }),
              },
            },
          }),
        ],
        existingReturns: [
          {
            item_id: "item_kit",
            quantity: 1,
            metadata: {
              bundle_component: {
                variant_id: "bag",
                title: "Bag",
                amount: 83.33,
              },
            },
          },
        ],
        precision: 2,
      })
    ).toEqual([{ id: "item_kit", quantity: 1 }])
  })

  const twoLensKit = (lineQuantity: number) =>
    computeBundleRefundShares({
      components: [
        {
          variant_id: "lens",
          title: "Lens",
          quantity: 2,
          unit_price: 300,
          inventory_items: [],
        },
        {
          variant_id: "bag",
          title: "Bag",
          quantity: 1,
          unit_price: 100,
          inventory_items: [],
        },
      ],
      lineQuantity,
      amountPaid: 700 * lineQuantity,
      precision: 2,
    })

  it("returns every unit of a component that a bundle holds several of", () => {
    const [item] = prepareBundleReturnItems({
      items: [{ id: "item_kit", quantity: 2, component_variant_id: "lens" }],
      orderItems: [
        kitLine({ metadata: { bundle: { components: twoLensKit(1) } } }),
      ],
      existingReturns: [],
      precision: 2,
    })

    expect(item.metadata!.bundle_component.amount).toEqual(600)
  })

  it("counts a bundle as touched once any of its several units of a component is returned", () => {
    // 2 bundles of 2 lenses; 1 lens returned touches 1 bundle, so 1 bundle can
    // still be returned whole.
    const line = kitLine({
      quantity: 2,
      fulfilled_quantity: 2,
      metadata: { bundle: { components: twoLensKit(2) } },
    })
    const lensReturned = {
      item_id: "item_kit",
      quantity: 1,
      metadata: {
        bundle_component: { variant_id: "lens", title: "Lens", amount: 150 },
      },
    }

    expect(
      prepareBundleReturnItems({
        items: [{ id: "item_kit", quantity: 1 }],
        orderItems: [line],
        existingReturns: [lensReturned],
        precision: 2,
      })
    ).toEqual([{ id: "item_kit", quantity: 1 }])

    expect(() =>
      prepareBundleReturnItems({
        items: [{ id: "item_kit", quantity: 2 }],
        orderItems: [line],
        existingReturns: [lensReturned],
        precision: 2,
      })
    ).toThrow("only 1 can be returned whole")
  })

  it("names how many bundles are left to return whole", () => {
    // 3 bundles: 1 returned whole, 1 has a returned bag -> 1 left.
    expect(() =>
      prepareBundleReturnItems({
        items: [{ id: "item_kit", quantity: 2 }],
        orderItems: [
          kitLine({
            quantity: 3,
            fulfilled_quantity: 3,
            return_requested_quantity: 1,
            metadata: {
              bundle: {
                components: computeBundleRefundShares({
                  components: cameraKit(),
                  lineQuantity: 3,
                  amountPaid: 3000,
                  precision: 2,
                }),
              },
            },
          }),
        ],
        existingReturns: [
          {
            item_id: "item_kit",
            quantity: 1,
            metadata: {
              bundle_component: {
                variant_id: "bag",
                title: "Bag",
                amount: 83.33,
              },
            },
          },
        ],
        precision: 2,
      })
    ).toThrow(
      'Cannot return 2 of the bundle "Camera kit": only 1 can be returned whole, because items of the other bundles were already returned. Return the remaining items individually instead.'
    )
  })

  it("counts a whole-bundle return earlier in the same request", () => {
    expect(() =>
      prepareBundleReturnItems({
        items: [
          { id: "item_kit", quantity: 1 },
          { id: "item_kit", quantity: 1, component_variant_id: "bag" },
        ],
        orderItems: [kitLine()],
        existingReturns: [],
        precision: 2,
      })
    ).toThrow(
      'Cannot return 1 of "Bag" from the bundle "Camera kit": only 0 can be returned.'
    )
  })

  it("returns a bundle ordered before shares were saved as a whole (AC 19)", () => {
    expect(
      prepareBundleReturnItems({
        items: [{ id: "item_kit", quantity: 1 }],
        orderItems: [
          kitLine({
            metadata: { bundle: { components: [{ variant_id: "bag" }] } },
          }),
        ],
        existingReturns: [],
        precision: 2,
      })
    ).toEqual([{ id: "item_kit", quantity: 1 }])
  })

  it("leaves items of lines without metadata unchanged", () => {
    expect(
      prepareBundleReturnItems({
        items: [{ id: "item_plain", quantity: 1 }],
        orderItems: [
          {
            id: "item_plain",
            quantity: 1,
            fulfilled_quantity: 1,
            metadata: null,
          },
        ],
        existingReturns: [],
        precision: 2,
      })
    ).toEqual([{ id: "item_plain", quantity: 1 }])
  })

  it("rejects a component that isn't in the bundle (AC 19)", () => {
    expect(() =>
      prepareBundleReturnItems({
        items: [
          { id: "item_kit", quantity: 1, component_variant_id: "tripod" },
        ],
        orderItems: [kitLine()],
        existingReturns: [],
        precision: 2,
      })
    ).toThrow('Variant tripod is not part of the bundle "Camera kit".')
  })

  it("rejects a component of a line that isn't a bundle", () => {
    expect(() =>
      prepareBundleReturnItems({
        items: [{ id: "item_shirt", quantity: 1, component_variant_id: "bag" }],
        orderItems: [shirtLine],
        existingReturns: [],
        precision: 2,
      })
    ).toThrow(
      "Item item_shirt is not a bundle, so a component can't be returned from it."
    )
  })

  it("rejects a component of a bundle ordered before shares were saved (AC 19)", () => {
    expect(() =>
      prepareBundleReturnItems({
        items: [{ id: "item_kit", quantity: 1, component_variant_id: "bag" }],
        orderItems: [
          kitLine({
            metadata: { bundle: { components: [{ variant_id: "bag" }] } },
          }),
        ],
        existingReturns: [],
        precision: 2,
      })
    ).toThrow(
      'The bundle "Camera kit" was ordered before single items could be returned. Return the whole bundle instead.'
    )
  })

  it("rejects returning more of a component than was bought (AC 19)", () => {
    expect(() =>
      prepareBundleReturnItems({
        items: [{ id: "item_kit", quantity: 2, component_variant_id: "bag" }],
        orderItems: [kitLine()],
        existingReturns: [],
        precision: 2,
      })
    ).toThrow(
      'Cannot return 2 of "Bag" from the bundle "Camera kit": only 1 can be returned.'
    )
  })

  it("rejects returning a component again after an earlier return (AC 19)", () => {
    expect(() =>
      prepareBundleReturnItems({
        items: [{ id: "item_kit", quantity: 1, component_variant_id: "bag" }],
        orderItems: [kitLine()],
        existingReturns: [
          {
            item_id: "item_kit",
            quantity: 1,
            metadata: {
              bundle_component: {
                variant_id: "bag",
                title: "Bag",
                amount: 83.33,
              },
            },
          },
        ],
        precision: 2,
      })
    ).toThrow(
      'Cannot return 1 of "Bag" from the bundle "Camera kit": only 0 can be returned.'
    )
  })

  it("counts the same component twice in one request", () => {
    expect(() =>
      prepareBundleReturnItems({
        items: [
          { id: "item_kit", quantity: 1, component_variant_id: "bag" },
          { id: "item_kit", quantity: 1, component_variant_id: "bag" },
        ],
        orderItems: [kitLine()],
        existingReturns: [],
        precision: 2,
      })
    ).toThrow("only 0 can be returned")
  })

  it("rejects a component of a bundle that wasn't fulfilled", () => {
    expect(() =>
      prepareBundleReturnItems({
        items: [{ id: "item_kit", quantity: 1, component_variant_id: "bag" }],
        orderItems: [kitLine({ fulfilled_quantity: 0 })],
        existingReturns: [],
        precision: 2,
      })
    ).toThrow("only 0 can be returned")
  })

  it("rejects a component of a bundle that was returned whole", () => {
    for (const field of [
      "return_requested_quantity",
      "return_received_quantity",
      "return_dismissed_quantity",
    ]) {
      expect(() =>
        prepareBundleReturnItems({
          items: [{ id: "item_kit", quantity: 1, component_variant_id: "bag" }],
          orderItems: [kitLine({ [field]: 1 })],
          existingReturns: [],
          precision: 2,
        })
      ).toThrow("only 0 can be returned")
    }
  })

  it("counts pending whole-bundle returns that aren't in the line's quantities yet", () => {
    expect(() =>
      prepareBundleReturnItems({
        items: [{ id: "item_kit", quantity: 1, component_variant_id: "bag" }],
        orderItems: [kitLine()],
        existingReturns: [{ item_id: "item_kit", quantity: 1 }],
        precision: 2,
      })
    ).toThrow("only 0 can be returned")
  })

  it("spreads the refund over earlier returns of the same component", () => {
    const line = kitLine({
      quantity: 3,
      fulfilled_quantity: 3,
      metadata: {
        bundle: {
          components: [
            {
              variant_id: "bag",
              title: "Bag",
              quantity: 1,
              units: 3,
              refund_share: 100,
              inventory_items: [],
            },
          ],
        },
      },
    })
    const existingReturns = [
      {
        item_id: "item_kit",
        quantity: 2,
        metadata: {
          bundle_component: { variant_id: "bag", title: "Bag", amount: 66.66 },
        },
      },
    ]

    const [item] = prepareBundleReturnItems({
      items: [{ id: "item_kit", quantity: 1, component_variant_id: "bag" }],
      orderItems: [line],
      existingReturns,
      precision: 2,
    })

    expect(item.metadata![BUNDLE_COMPONENT_METADATA_KEY].amount).toEqual(33.34)
  })
})

describe("prepareBundleReceiveItems", () => {
  const bagReturnItem = (overrides: Record<string, unknown> = {}) => ({
    item_id: "item_kit",
    quantity: 3,
    received_quantity: 0,
    metadata: {
      bundle_component: { variant_id: "bag", title: "Bag", amount: 100 },
    },
    ...overrides,
  })

  it("names the received component and its part of the refund", () => {
    const [item] = prepareBundleReceiveItems({
      items: [{ id: "item_kit", quantity: 1, component_variant_id: "bag" }],
      returnItems: [bagReturnItem()],
      precision: 2,
    })

    expect(item).toEqual({
      id: "item_kit",
      quantity: 1,
      metadata: {
        bundle_component: { variant_id: "bag", title: "Bag", amount: 33.33 },
      },
    })
  })

  it("adds up to the return item's refund over partial receipts", () => {
    const amounts = [0, 1, 2].map(
      (received) =>
        prepareBundleReceiveItems({
          items: [{ id: "item_kit", quantity: 1, component_variant_id: "bag" }],
          returnItems: [bagReturnItem({ received_quantity: received })],
          precision: 2,
        })[0].metadata!.bundle_component.amount
    )

    expect(amounts).toEqual([33.33, 33.33, 33.34])
  })

  it("counts quantities received in the pending receive change", () => {
    const [item] = prepareBundleReceiveItems({
      items: [{ id: "item_kit", quantity: 1, component_variant_id: "bag" }],
      returnItems: [bagReturnItem()],
      pendingReceived: {
        [bundleReturnItemKey("item_kit", bagReturnItem().metadata)]: 2,
      },
      precision: 2,
    })

    expect(item.metadata!.bundle_component.amount).toEqual(33.34)
  })

  it("rejects receiving more than was returned", () => {
    expect(() =>
      prepareBundleReceiveItems({
        items: [{ id: "item_kit", quantity: 2, component_variant_id: "bag" }],
        returnItems: [bagReturnItem({ received_quantity: 2 })],
        precision: 2,
      })
    ).toThrow('Cannot receive more of "Bag" than was returned.')
  })

  it("rejects a component the return doesn't have", () => {
    expect(() =>
      prepareBundleReceiveItems({
        items: [{ id: "item_kit", quantity: 1, component_variant_id: "lens" }],
        returnItems: [bagReturnItem()],
        precision: 2,
      })
    ).toThrow("The return has no item for variant lens of item item_kit.")
  })

  it("receives the component of the right line when two lines return it", () => {
    const [item] = prepareBundleReceiveItems({
      items: [{ id: "item_kit2", quantity: 1, component_variant_id: "bag" }],
      returnItems: [
        bagReturnItem(),
        bagReturnItem({
          item_id: "item_kit2",
          quantity: 1,
          metadata: {
            bundle_component: { variant_id: "bag", title: "Bag", amount: 50 },
          },
        }),
      ],
      precision: 2,
    })

    expect(item.metadata!.bundle_component.amount).toEqual(50)
  })

  it("finds the component when the return also has a whole bundle of the same line", () => {
    // 2 kits on the line: one returned whole, the bag of the other.
    const [item] = prepareBundleReceiveItems({
      items: [{ id: "item_kit", quantity: 1, component_variant_id: "bag" }],
      returnItems: [
        {
          item_id: "item_kit",
          quantity: 1,
          received_quantity: 0,
          metadata: null,
        },
        bagReturnItem(),
      ],
      precision: 2,
    })

    expect(item.metadata!.bundle_component.variant_id).toEqual("bag")
  })

  it("counts the same component twice in one receive request", () => {
    expect(() =>
      prepareBundleReceiveItems({
        items: [
          { id: "item_kit", quantity: 2, component_variant_id: "bag" },
          { id: "item_kit", quantity: 2, component_variant_id: "bag" },
        ],
        returnItems: [bagReturnItem()],
        precision: 2,
      })
    ).toThrow('Cannot receive more of "Bag" than was returned.')
  })

  it("keeps the client's metadata on a received component", () => {
    const [item] = prepareBundleReceiveItems({
      items: [
        {
          id: "item_kit",
          quantity: 1,
          component_variant_id: "bag",
          metadata: { note: "dented" },
        },
      ],
      returnItems: [bagReturnItem()],
      precision: 2,
    })

    expect(item.metadata).toEqual(
      expect.objectContaining({
        note: "dented",
        bundle_component: expect.anything(),
      })
    )
  })

  it("leaves items without a component unchanged", () => {
    expect(
      prepareBundleReceiveItems({
        items: [{ id: "item_shirt", quantity: 1 }],
        returnItems: [bagReturnItem()],
        precision: 2,
      })
    ).toEqual([{ id: "item_shirt", quantity: 1 }])
  })
})

describe("bundleReturnItemKey", () => {
  it("separates return items of different components of one line", () => {
    const bag = {
      bundle_component: { variant_id: "bag", title: "Bag", amount: 1 },
    }
    const lens = {
      bundle_component: { variant_id: "lens", title: "Lens", amount: 1 },
    }

    expect(bundleReturnItemKey("item_kit", bag)).not.toEqual(
      bundleReturnItemKey("item_kit", lens)
    )
    expect(bundleReturnItemKey("item_kit", null)).toEqual("item_kit")
  })
})

describe("getComponentRestockAdjustments", () => {
  it("restocks only the returned component's inventory items (AC 15)", () => {
    expect(
      getComponentRestockAdjustments({
        received: [{ item_id: "item_kit", quantity: 1, variant_id: "bag" }],
        orderItems: [kitLine()],
      })
    ).toEqual([{ inventory_item_id: "ii_bag", adjustment: expect.anything() }])
  })

  it("multiplies by each link's required quantity and adds up shared items", () => {
    const line = kitLine({
      metadata: {
        bundle: {
          components: [
            {
              variant_id: "kit2",
              title: "Kit",
              quantity: 1,
              units: 1,
              refund_share: 1,
              inventory_items: [
                { inventory_item_id: "ii_a", required_quantity: 2 },
                { inventory_item_id: "ii_b", required_quantity: 1 },
              ],
            },
          ],
        },
      },
    })

    const result = getComponentRestockAdjustments({
      received: [
        { item_id: "item_kit", quantity: 1, variant_id: "kit2" },
        { item_id: "item_kit", quantity: 2, variant_id: "kit2" },
      ],
      orderItems: [line],
    })

    expect(
      result.map((r) => [r.inventory_item_id, Number(r.adjustment.toString())])
    ).toEqual([
      ["ii_a", 6],
      ["ii_b", 3],
    ])
  })

  it("restocks nothing for an unknown line or component", () => {
    expect(
      getComponentRestockAdjustments({
        received: [
          { item_id: "item_other", quantity: 1, variant_id: "bag" },
          { item_id: "item_kit", quantity: 1, variant_id: "tripod" },
        ],
        orderItems: [kitLine()],
      })
    ).toEqual([])
  })
})

describe("withoutBundleComponentMetadata", () => {
  it("removes only the returned-component key", () => {
    expect(
      withoutBundleComponentMetadata({
        id: "a",
        metadata: { bundle_component: { amount: 1 }, note: "x" },
      })
    ).toEqual({ id: "a", metadata: { note: "x" } })
  })

  it("returns items without the key unchanged", () => {
    const item = { id: "a", metadata: { note: "x" } }
    expect(withoutBundleComponentMetadata(item)).toBe(item)
    const bare: { id: string; metadata?: null } = { id: "b" }
    expect(withoutBundleComponentMetadata(bare)).toBe(bare)
  })
})

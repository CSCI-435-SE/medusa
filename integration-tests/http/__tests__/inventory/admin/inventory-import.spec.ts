import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import FormData from "form-data"
import {
  adminHeaders,
  createAdminUser,
} from "../../../../helpers/create-admin-user"

jest.setTimeout(30000)

const HEADER =
  "Title,SKU,Requires Shipping,Stocked Quantity,Location,Description,Width,Length,Height,Weight,MID Code,HS Code,Country of Origin,Material"

const getUploadReq = (...rows: string[]) => {
  const form = new FormData()
  form.append(
    "file",
    Buffer.from([HEADER, ...rows].join("\n")),
    "inventory.csv"
  )
  return {
    form,
    meta: {
      headers: {
        ...adminHeaders.headers,
        ...form.getHeaders(),
      },
    },
  }
}

medusaIntegrationTestRunner({
  testSuite: ({ dbConnection, api, getContainer }) => {
    let mainWarehouse
    let secondWarehouse

    beforeEach(async () => {
      await createAdminUser(dbConnection, adminHeaders, getContainer())

      mainWarehouse = (
        await api.post(
          `/admin/stock-locations`,
          { name: "Main Warehouse" },
          adminHeaders
        )
      ).data.stock_location

      secondWarehouse = (
        await api.post(
          `/admin/stock-locations`,
          { name: "Second Warehouse" },
          adminHeaders
        )
      ).data.stock_location
    })

    const findItems = async (sku: string) => {
      const response = await api.get(
        `/admin/inventory-items?sku=${encodeURIComponent(
          sku
        )}&fields=*location_levels`,
        adminHeaders
      )
      return response.data.inventory_items
    }

    describe("POST /admin/inventory-items/import", () => {
      it("creates every item in a valid file with its stock at the named location", async () => {
        const { form, meta } = getUploadReq(
          "Shirt,SHIRT-1,true,10,Main Warehouse,Cotton shirt,20,30,2,12.5,MID1,HS1,us,Cotton",
          "Mug,MUG-1,false,0,Second Warehouse,,,,,,,,,",
          "Cup,CUP-1,true,5,Main Warehouse,,,,,,,,,"
        )

        const response = await api.post(
          "/admin/inventory-items/import",
          form,
          meta
        )

        expect(response.status).toEqual(200)
        expect(response.data).toEqual({ created: 3 })

        const [shirt] = await findItems("SHIRT-1")
        expect(shirt).toEqual(
          expect.objectContaining({
            title: "Shirt",
            sku: "SHIRT-1",
            requires_shipping: true,
            description: "Cotton shirt",
            width: 20,
            length: 30,
            height: 2,
            weight: 12.5,
            mid_code: "MID1",
            hs_code: "HS1",
            origin_country: "us",
            material: "Cotton",
            location_levels: [
              expect.objectContaining({
                location_id: mainWarehouse.id,
                stocked_quantity: 10,
              }),
            ],
          })
        )

        const [mug] = await findItems("MUG-1")
        expect(mug.requires_shipping).toEqual(false)
        expect(mug.location_levels).toEqual([
          expect.objectContaining({
            location_id: secondWarehouse.id,
            stocked_quantity: 0,
          }),
        ])

        expect(await findItems("CUP-1")).toHaveLength(1)
      })

      it("creates no items when any row is invalid", async () => {
        const { form, meta } = getUploadReq(
          "Mug,MUG-1,false,1,Main Warehouse,,,,,,,,,",
          "Cup,CUP-1,false,1,Attic,,,,,,,,,"
        )

        const error = await api
          .post("/admin/inventory-items/import", form, meta)
          .catch((e) => e)

        expect(error.response.status).toEqual(400)
        expect(error.response.data.message).toContain(
          'Row 3: No stock location is named "Attic"'
        )
        expect(await findItems("MUG-1")).toHaveLength(0)
        expect(await findItems("CUP-1")).toHaveLength(0)
      })

      it("rejects a SKU that already belongs to an inventory item", async () => {
        await api.post(
          `/admin/inventory-items`,
          { title: "Existing mug", sku: "MUG-1" },
          adminHeaders
        )

        const { form, meta } = getUploadReq(
          "Mug,MUG-1,false,1,Main Warehouse,,,,,,,,,"
        )

        const error = await api
          .post("/admin/inventory-items/import", form, meta)
          .catch((e) => e)

        expect(error.response.status).toEqual(400)
        expect(error.response.data.message).toContain(
          "Row 2: An inventory item with the SKU MUG-1 already exists"
        )
        expect(await findItems("MUG-1")).toHaveLength(1)
      })

      it("allows a SKU that only belongs to a deleted inventory item", async () => {
        const deleted = (
          await api.post(
            `/admin/inventory-items`,
            { title: "Old mug", sku: "MUG-1" },
            adminHeaders
          )
        ).data.inventory_item
        await api.delete(`/admin/inventory-items/${deleted.id}`, adminHeaders)

        const { form, meta } = getUploadReq(
          "Mug,MUG-1,false,1,Main Warehouse,,,,,,,,,"
        )

        const response = await api.post(
          "/admin/inventory-items/import",
          form,
          meta
        )

        expect(response.status).toEqual(200)
        expect(response.data).toEqual({ created: 1 })

        const items = await findItems("MUG-1")
        expect(items).toHaveLength(1)
        expect(items[0].title).toEqual("Mug")
      })
    })
  },
})

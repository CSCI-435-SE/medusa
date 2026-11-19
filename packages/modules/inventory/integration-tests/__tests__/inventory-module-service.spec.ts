import {
  IInventoryService,
  InventoryItemDTO,
  ReservationItemDTO,
} from "@medusajs/framework/types"
import {
  BigNumber,
  CommonEvents,
  composeMessage,
  InventoryEvents,
  Module,
  Modules,
} from "@medusajs/framework/utils"
import {
  MockEventBusService,
  moduleIntegrationTestRunner,
} from "@medusajs/test-utils"
import { InventoryModuleService } from "../../src/services"

jest.setTimeout(100000)

moduleIntegrationTestRunner<IInventoryService>({
  moduleName: Modules.INVENTORY,
  injectedDependencies: {
    [Modules.EVENT_BUS]: new MockEventBusService(),
  },
  testSuite: ({ service, MikroOrmWrapper }) => {
    describe("Inventory Module Service", () => {
      it(`should export the appropriate linkable configuration`, () => {
        const linkable = Module(Modules.INVENTORY, {
          service: InventoryModuleService,
        }).linkable

        expect(Object.keys(linkable)).toEqual([
          "inventoryItem",
          "inventoryLevel",
          "reservationItem",
        ])

        Object.keys(linkable).forEach((key) => {
          delete linkable[key].toJSON
        })

        expect(linkable).toEqual({
          inventoryItem: {
            id: {
              field: "inventoryItem",
              entity: "InventoryItem",
              linkable: "inventory_item_id",
              primaryKey: "id",
              serviceName: "inventory",
            },
          },
          inventoryLevel: {
            id: {
              field: "inventoryLevel",
              entity: "InventoryLevel",
              linkable: "inventory_level_id",
              primaryKey: "id",
              serviceName: "inventory",
            },
          },
          reservationItem: {
            id: {
              field: "reservationItem",
              entity: "ReservationItem",
              linkable: "reservation_item_id",
              primaryKey: "id",
              serviceName: "inventory",
            },
          },
        })
      })

      describe("create", () => {
        it("should create an inventory item", async () => {
          const data = { sku: "test-sku", origin_country: "test-country" }
          const inventoryItem = await service.createInventoryItems(data)

          expect(inventoryItem).toEqual(
            expect.objectContaining({ id: expect.any(String), ...data })
          )
        })

        it("should create inventory items from array", async () => {
          const data = [
            { sku: "test-sku", origin_country: "test-country" },
            { sku: "test-sku-1", origin_country: "test-country-1" },
          ]
          const inventoryItems = await service.createInventoryItems(data)

          expect(inventoryItems).toEqual([
            expect.objectContaining({ id: expect.any(String), ...data[0] }),
            expect.objectContaining({ id: expect.any(String), ...data[1] }),
          ])
        })
      })

      describe("createReservationItem", () => {
        let inventoryItem: InventoryItemDTO
        beforeEach(async () => {
          inventoryItem = await service.createInventoryItems({
            sku: "test-sku",
            origin_country: "test-country",
          })

          await service.createInventoryLevels([
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-1",
              stocked_quantity: 2,
            },
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-2",
              stocked_quantity: 2,
            },
          ])
        })

        it("should create a reservationItem", async () => {
          const data = {
            inventory_item_id: inventoryItem.id,
            location_id: "location-1",
            quantity: 2,
          }

          const reservationItem = await service.createReservationItems(data)

          expect(reservationItem).toEqual(
            expect.objectContaining({ id: expect.any(String), ...data })
          )
        })

        it("should create adjust reserved_quantity of inventory level after creation", async () => {
          await service.createReservationItems({
            inventory_item_id: inventoryItem.id,
            location_id: "location-1",
            quantity: 2,
          })

          const inventoryLevel =
            await service.retrieveInventoryLevelByItemAndLocation(
              inventoryItem.id,
              "location-1"
            )

          expect(inventoryLevel.reserved_quantity).toEqual(2)
        })

        it("should check inventory levels before creating reservation", async () => {
          const reserveMoreThanInStock = service.createReservationItems({
            inventory_item_id: inventoryItem.id,
            location_id: "location-1",
            quantity: 3,
          })

          await expect(reserveMoreThanInStock).rejects.toThrow(
            `Not enough stock available for item ${inventoryItem.id} at location location-1`
          )

          let inventoryLevel =
            await service.retrieveInventoryLevelByItemAndLocation(
              inventoryItem.id,
              "location-1"
            )

          expect(inventoryLevel.reserved_quantity).toEqual(0)

          await service.createReservationItems({
            inventory_item_id: inventoryItem.id,
            location_id: "location-1",
            allow_backorder: true,
            quantity: 3,
          })

          inventoryLevel =
            await service.retrieveInventoryLevelByItemAndLocation(
              inventoryItem.id,
              "location-1"
            )

          expect(inventoryLevel.reserved_quantity).toEqual(3)
        })

        it("should check the stock for all reservations of one batch together", async () => {
          // Stock is 2: each reservation fits on its own, both together don't
          // (a bundle and one of its components in the same cart).
          const reserveTwiceTheStock = service.createReservationItems([
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-1",
              quantity: 2,
              line_item_id: "line-bundle",
            },
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-1",
              quantity: 1,
              line_item_id: "line-component",
            },
          ])

          await expect(reserveTwiceTheStock).rejects.toThrow(
            `Not enough stock available for item ${inventoryItem.id} at location location-1`
          )

          const inventoryLevel =
            await service.retrieveInventoryLevelByItemAndLocation(
              inventoryItem.id,
              "location-1"
            )
          expect(inventoryLevel.reserved_quantity).toEqual(0)

          // Other locations have their own stock.
          await service.createReservationItems([
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-1",
              quantity: 2,
            },
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-2",
              quantity: 2,
            },
          ])
        })

        it("should create reservationItems from array", async () => {
          const data = [
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-1",
              quantity: 2,
            },
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-2",
              allow_backorder: true,
              quantity: 3,
            },
          ]
          const reservationItems = await service.createReservationItems(data)

          expect(reservationItems).toEqual([
            expect.objectContaining({ id: expect.any(String), ...data[0] }),
            expect.objectContaining({ id: expect.any(String), ...data[1] }),
          ])
        })

        it("should fail to create a reservationItem for a non-existing location", async () => {
          const data = [
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-3",
              quantity: 2,
            },
          ]

          const err = await service
            .createReservationItems(data)
            .catch((error) => error)

          expect(err.message).toEqual(
            `Item ${inventoryItem.id} is not stocked at location location-3`
          )
        })
      })

      describe("createInventoryLevel", () => {
        let inventoryItem: InventoryItemDTO

        beforeEach(async () => {
          inventoryItem = await service.createInventoryItems({
            sku: "test-sku",
            origin_country: "test-country",
          })
        })

        it("should create an inventoryLevel", async () => {
          const data = {
            inventory_item_id: inventoryItem.id,
            location_id: "location-1",
            stocked_quantity: 2,
          }

          const inventoryLevel = await service.createInventoryLevels(data)

          expect(inventoryLevel).toEqual(
            expect.objectContaining({ id: expect.any(String), ...data })
          )

          const getItems = await service.listInventoryItems(
            {},
            {
              select: [
                "id",
                "sku",
                "origin_country",
                "reserved_quantity",
                "stocked_quantity",
              ],
            }
          )

          expect(getItems).toEqual([
            {
              id: inventoryItem.id,
              sku: "test-sku",
              origin_country: "test-country",
              reserved_quantity: 0,
              stocked_quantity: 2,
            },
          ])
        })

        it("should create inventoryLevels from array", async () => {
          const data = [
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-1",
              stocked_quantity: 2,
            },
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-2",
              stocked_quantity: 3,
            },
          ]
          const inventoryLevels = await service.createInventoryLevels(data)

          expect(inventoryLevels).toEqual([
            expect.objectContaining({ id: expect.any(String), ...data[0] }),
            expect.objectContaining({ id: expect.any(String), ...data[1] }),
          ])
        })

        it("should not create with required quantity", async () => {
          const data = {
            inventory_item_id: inventoryItem.id,
            location_id: "location-1",
            stocked_quantity: 2,
            reserved_quantity: 1000,
          }

          const inventoryLevel = await service.createInventoryLevels(data)

          expect(inventoryLevel).toEqual(
            expect.objectContaining({
              id: expect.any(String),
              ...data,
              reserved_quantity: 0,
            })
          )
        })
      })

      describe("update", () => {
        let inventoryItem: InventoryItemDTO

        beforeEach(async () => {
          inventoryItem = await service.createInventoryItems({
            sku: "test-sku",
            origin_country: "test-country",
          })
        })

        it("should update the inventory item", async () => {
          const update = {
            id: inventoryItem.id,
            sku: "updated-sku",
          }
          const updated = await service.updateInventoryItems(update)

          expect(updated).toEqual(expect.objectContaining(update))
        })

        it("should update multiple inventory items", async () => {
          const item2 = await service.createInventoryItems({
            sku: "test-sku-1",
          })

          const updates = [
            {
              id: inventoryItem.id,
              sku: "updated-sku",
            },
            {
              id: item2.id,
              sku: "updated-sku-2",
            },
          ]
          const updated = await service.updateInventoryItems(updates)

          expect(updated).toEqual([
            expect.objectContaining(updates[0]),
            expect.objectContaining(updates[1]),
          ])
        })
      })

      describe("updateInventoryLevels", () => {
        let inventoryLevel
        let inventoryItem

        beforeEach(async () => {
          inventoryItem = await service.createInventoryItems({
            sku: "test-sku",
            origin_country: "test-country",
          })

          const data = {
            inventory_item_id: inventoryItem.id,
            location_id: "location-1",
            stocked_quantity: 2,
          }

          inventoryLevel = await service.createInventoryLevels(data)
        })

        it("should update inventory level", async () => {
          const updatedLevel = await service.updateInventoryLevels({
            location_id: "location-1",
            inventory_item_id: inventoryItem.id,
            incoming_quantity: 4,
          })

          expect(updatedLevel.incoming_quantity).toEqual(4)
        })

        it("should fail to update inventory level for item in location that isn't stocked", async () => {
          const error = await service
            .updateInventoryLevels({
              inventory_item_id: inventoryItem.id,
              location_id: "does-not-exist",
              stocked_quantity: 10,
            })
            .catch((error) => error)

          expect(error.message).toEqual(
            `Item ${inventoryItem.id} is not stocked at location does-not-exist`
          )
        })
      })

      describe("updateReservationItems", () => {
        let reservationItem
        let inventoryItem

        beforeEach(async () => {
          inventoryItem = await service.createInventoryItems({
            sku: "test-sku",
            origin_country: "test-country",
          })

          await service.createInventoryLevels([
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-1",
              stocked_quantity: 10,
            },
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-2",
              stocked_quantity: 10,
            },
          ])

          reservationItem = await service.createReservationItems({
            inventory_item_id: inventoryItem.id,
            location_id: "location-1",
            quantity: 3,
          })
        })

        it("should update a reservationItem", async () => {
          const eventBusSpy = jest.spyOn(MockEventBusService.prototype, "emit")

          const update = {
            id: reservationItem.id,
            quantity: 1,
          }

          const updated = await service.updateReservationItems(update)

          const inventoryLevel =
            await service.retrieveInventoryLevelByItemAndLocation(
              reservationItem.inventory_item_id,
              "location-1"
            )

          expect(updated).toEqual(expect.objectContaining(update))

          expect(eventBusSpy).toHaveBeenCalledTimes(1)
          expect(eventBusSpy.mock.calls[0][0]).toHaveLength(2)
          expect(eventBusSpy).toHaveBeenNthCalledWith(
            1,
            expect.arrayContaining([
              composeMessage(InventoryEvents.RESERVATION_ITEM_UPDATED, {
                data: { id: reservationItem.id },
                object: "reservation_item",
                source: Modules.INVENTORY,
                action: CommonEvents.UPDATED,
              }),
              composeMessage(InventoryEvents.INVENTORY_LEVEL_UPDATED, {
                data: { id: inventoryLevel.id },
                object: "inventory_level",
                source: Modules.INVENTORY,
                action: CommonEvents.UPDATED,
              }),
            ]),
            {
              internal: true,
            }
          )

          const update2 = {
            id: reservationItem.id,
            quantity: 10,
          }

          eventBusSpy.mockClear()

          const updated2 = await service.updateReservationItems(update2)

          expect(updated2).toEqual(expect.objectContaining(update2))

          expect(eventBusSpy).toHaveBeenCalledTimes(1)
          expect(eventBusSpy.mock.calls[0][0]).toHaveLength(2)
          expect(eventBusSpy).toHaveBeenNthCalledWith(
            1,
            expect.arrayContaining([
              composeMessage(InventoryEvents.RESERVATION_ITEM_UPDATED, {
                data: { id: reservationItem.id },
                object: "reservation_item",
                source: Modules.INVENTORY,
                action: CommonEvents.UPDATED,
              }),
              composeMessage(InventoryEvents.INVENTORY_LEVEL_UPDATED, {
                data: { id: inventoryLevel.id },
                object: "inventory_level",
                source: Modules.INVENTORY,
                action: CommonEvents.UPDATED,
              }),
            ]),
            {
              internal: true,
            }
          )
        })

        it("should adjust reserved_quantity of inventory level after updates increasing reserved quantity", async () => {
          const update = {
            id: reservationItem.id,
            quantity: 7,
          }

          await service.updateReservationItems(update)

          const inventoryLevel =
            await service.retrieveInventoryLevelByItemAndLocation(
              reservationItem.inventory_item_id,
              "location-1"
            )

          expect(inventoryLevel.reserved_quantity).toEqual(update.quantity)
        })

        it("should adjust reserved_quantity of inventory level after updates decreasing reserved quantity", async () => {
          const update = {
            id: reservationItem.id,
            quantity: 2,
          }

          await service.updateReservationItems(update)

          const inventoryLevel =
            await service.retrieveInventoryLevelByItemAndLocation(
              reservationItem.inventory_item_id,
              "location-1"
            )

          expect(inventoryLevel.reserved_quantity).toEqual(update.quantity)
        })

        it("should throw error when increasing reserved quantity beyond availability", async () => {
          const update = {
            id: reservationItem.id,
            quantity: 11,
          }

          const error = await service
            .updateReservationItems(update)
            .catch((e) => e)

          expect(error.message).toEqual(
            `Not enough stock available for item ${inventoryItem.id} at location location-1`
          )
        })
      })

      describe("deleteReservationItems", () => {
        let inventoryItem: InventoryItemDTO
        let reservationItems: ReservationItemDTO[]

        beforeEach(async () => {
          inventoryItem = await service.createInventoryItems({
            sku: "test-sku",
            origin_country: "test-country",
          })

          await service.createInventoryLevels([
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-1",
              stocked_quantity: 2,
            },
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-2",
              stocked_quantity: 2,
            },
          ])

          reservationItems = await service.createReservationItems([
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-1",
              quantity: 2,
            },
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-2",
              quantity: 2,
            },
          ])
        })

        it("should delete reservation items by id", async () => {
          const reservationItemsPreDeleted = await service.listReservationItems(
            {
              id: reservationItems.map((item) => item.id),
            }
          )

          expect(reservationItemsPreDeleted).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                inventory_item_id: inventoryItem.id,
                location_id: "location-1",
                quantity: 2,
              }),
              expect.objectContaining({
                inventory_item_id: inventoryItem.id,
                location_id: "location-2",
                quantity: 2,
              }),
            ])
          )
          expect(reservationItemsPreDeleted).toHaveLength(2)

          await service.deleteReservationItems(
            reservationItems.map((item) => item.id)
          )

          const reservationItemsPostDeleted =
            await service.listReservationItems({
              id: reservationItems.map((item) => item.id),
            })

          expect(reservationItemsPostDeleted).toEqual([])
        })

        it("should adjust inventory levels accordingly when removing reservations by id", async () => {
          const reservationItem = (
            await service.listReservationItems({ location_id: "location-1" })
          )[0]

          const inventoryLevelBefore =
            await service.retrieveInventoryLevelByItemAndLocation(
              inventoryItem.id,
              "location-1"
            )

          expect(inventoryLevelBefore).toEqual(
            expect.objectContaining({ reserved_quantity: 2 })
          )

          await service.deleteReservationItems(reservationItem.id)

          const inventoryLevelAfter =
            await service.retrieveInventoryLevelByItemAndLocation(
              inventoryItem.id,
              "location-1"
            )

          expect(inventoryLevelAfter).toEqual(
            expect.objectContaining({ reserved_quantity: 0 })
          )
        })
      })

      describe("deleteReservationItemsByLineItem", () => {
        let inventoryItem: InventoryItemDTO

        beforeEach(async () => {
          inventoryItem = await service.createInventoryItems({
            sku: "test-sku",
            origin_country: "test-country",
          })

          await service.createInventoryLevels([
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-1",
              // Enough stock for every reservation below: a batch is checked as a whole.
              stocked_quantity: 6,
            },
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-2",
              stocked_quantity: 2,
            },
          ])

          await service.createReservationItems([
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-1",
              quantity: 2,
            },
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-1",
              quantity: 2,
              line_item_id: "line-item-id",
            },
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-1",
              quantity: 2,
              line_item_id: "line-item-id",
            },
          ])
        })

        it("should delete reseravation items by line item and restore them", async () => {
          const reservationsPreDeleted = await service.listReservationItems({
            line_item_id: "line-item-id",
          })

          expect(reservationsPreDeleted).toEqual([
            expect.objectContaining({
              location_id: "location-1",
              quantity: 2,
              line_item_id: "line-item-id",
            }),
            expect.objectContaining({
              location_id: "location-1",
              quantity: 2,
              line_item_id: "line-item-id",
            }),
          ])

          await service.deleteReservationItemsByLineItem("line-item-id")

          const reservationsPostDeleted = await service.listReservationItems({
            line_item_id: "line-item-id",
          })

          expect(reservationsPostDeleted).toEqual([])

          await service.restoreReservationItemsByLineItem("line-item-id")

          const reservationsPostRestored = await service.listReservationItems({
            line_item_id: "line-item-id",
          })

          expect(reservationsPostRestored).toEqual([
            expect.objectContaining({
              location_id: "location-1",
              quantity: 2,
              line_item_id: "line-item-id",
            }),
            expect.objectContaining({
              location_id: "location-1",
              quantity: 2,
              line_item_id: "line-item-id",
            }),
          ])
        })

        it("should adjust inventory levels accordingly when removing reservations by line item", async () => {
          const inventoryLevelBefore =
            await service.retrieveInventoryLevelByItemAndLocation(
              inventoryItem.id,
              "location-1"
            )

          expect(inventoryLevelBefore).toEqual(
            expect.objectContaining({ reserved_quantity: 6 })
          )

          await service.deleteReservationItemsByLineItem("line-item-id")

          const inventoryLevel =
            await service.retrieveInventoryLevelByItemAndLocation(
              inventoryItem.id,
              "location-1"
            )

          expect(inventoryLevel).toEqual(
            expect.objectContaining({ reserved_quantity: 2 })
          )
        })
      })

      describe("deleteReservationItemByLocationId", () => {
        let inventoryItem: InventoryItemDTO
        beforeEach(async () => {
          inventoryItem = await service.createInventoryItems({
            sku: "test-sku",
            origin_country: "test-country",
          })

          await service.createInventoryLevels([
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-1",
              // Enough stock for every reservation below: a batch is checked as a whole.
              stocked_quantity: 4,
            },
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-2",
              stocked_quantity: 2,
            },
          ])

          await service.createReservationItems([
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-1",
              quantity: 2,
            },
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-1",
              quantity: 2,
              line_item_id: "line-item-id",
            },
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-2",
              quantity: 2,
              line_item_id: "line-item-id",
            },
          ])
        })

        it("deleted reservation items by line item", async () => {
          const reservationsPreDeleted = await service.listReservationItems({
            location_id: "location-1",
          })

          expect(reservationsPreDeleted).toEqual([
            expect.objectContaining({
              location_id: "location-1",
              quantity: 2,
            }),
            expect.objectContaining({
              location_id: "location-1",
              quantity: 2,
            }),
          ])

          await service.deleteReservationItemByLocationId("location-1")

          const reservationsPostDeleted = await service.listReservationItems({
            location_id: "location-1",
          })

          expect(reservationsPostDeleted).toEqual([])
        })

        it("should adjust inventory levels accordingly when removing reservations by line item", async () => {
          const inventoryLevelPreDelete =
            await service.retrieveInventoryLevelByItemAndLocation(
              inventoryItem.id,
              "location-1"
            )

          expect(inventoryLevelPreDelete).toEqual(
            expect.objectContaining({ reserved_quantity: 4 })
          )

          await service.deleteReservationItemByLocationId("location-1")

          const inventoryLevel =
            await service.retrieveInventoryLevelByItemAndLocation(
              inventoryItem.id,
              "location-1"
            )

          expect(inventoryLevel).toEqual(
            expect.objectContaining({ reserved_quantity: 0 })
          )
        })
      })

      describe("deleteInventoryItemLevelByLocationId", () => {
        let inventoryItem: InventoryItemDTO

        beforeEach(async () => {
          inventoryItem = await service.createInventoryItems({
            sku: "test-sku",
            origin_country: "test-country",
          })

          await service.createInventoryLevels([
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-1",
              stocked_quantity: 2,
            },
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-2",
              stocked_quantity: 2,
            },
          ])

          await service.createReservationItems({
            inventory_item_id: inventoryItem.id,
            location_id: "location-1",
            quantity: 1,
          })
        })

        it("should remove inventory levels with given location id", async () => {
          const inventoryLevelsPreDeletion = await service.listInventoryLevels(
            {}
          )

          expect(inventoryLevelsPreDeletion).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                stocked_quantity: 2,
                location_id: "location-1",
                reserved_quantity: 1,
              }),
              expect.objectContaining({
                stocked_quantity: 2,
                location_id: "location-2",
              }),
            ])
          )

          await service.deleteInventoryItemLevelByLocationId("location-1")

          const inventoryLevelsPostDeletion = await service.listInventoryLevels(
            {}
          )

          expect(inventoryLevelsPostDeletion).toEqual([
            expect.objectContaining({
              stocked_quantity: 2,
              location_id: "location-2",
            }),
          ])
        })
      })

      describe("deleteInventoryLevel", () => {
        let inventoryItem: InventoryItemDTO
        beforeEach(async () => {
          inventoryItem = await service.createInventoryItems({
            sku: "test-sku",
            origin_country: "test-country",
          })

          await service.createInventoryLevels([
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-1",
              stocked_quantity: 2,
            },
          ])
        })

        it("should remove inventory levels with given location id", async () => {
          const inventoryLevelsPreDeletion = await service.listInventoryLevels(
            {}
          )

          expect(inventoryLevelsPreDeletion).toEqual([
            expect.objectContaining({
              stocked_quantity: 2,
              location_id: "location-1",
            }),
          ])

          await service.deleteInventoryLevel(inventoryItem.id, "location-1")

          const inventoryLevelsPostDeletion = await service.listInventoryLevels(
            {}
          )

          expect(inventoryLevelsPostDeletion).toEqual([])
        })
      })

      describe("adjustInventory", () => {
        let inventoryItem: InventoryItemDTO
        beforeEach(async () => {
          inventoryItem = await service.createInventoryItems({
            sku: "test-sku",
            origin_country: "test-country",
          })

          await service.createInventoryLevels([
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-1",
              stocked_quantity: 2,
            },
          ])
        })

        it("should updated inventory level stocked_quantity by quantity", async () => {
          const updatedLevel = await service.adjustInventory(
            inventoryItem.id,
            "location-1",
            2
          )
          expect(updatedLevel.stocked_quantity).toEqual(4)
        })

        it("should updated inventory level stocked_quantity by negative quantity", async () => {
          const updatedLevel = await service.adjustInventory(
            inventoryItem.id,
            "location-1",
            -1
          )
          expect(updatedLevel.stocked_quantity).toEqual(1!)
        })
      })

      describe("retrieveInventoryLevelByItemAndLocation", () => {
        let inventoryItem: InventoryItemDTO
        beforeEach(async () => {
          inventoryItem = await service.createInventoryItems({
            sku: "test-sku",
            origin_country: "test-country",
          })
          const inventoryItem1 = await service.createInventoryItems({
            sku: "test-sku-1",
            origin_country: "test-country",
          })

          await service.createInventoryLevels([
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-1",
              stocked_quantity: 2,
            },
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-2",
              stocked_quantity: 3,
            },
            {
              inventory_item_id: inventoryItem1.id,
              location_id: "location-1",
              stocked_quantity: 3,
            },
          ])
        })

        it("should retrieve inventory level with provided location_id and inventory_item", async () => {
          const level = await service.retrieveInventoryLevelByItemAndLocation(
            inventoryItem.id,
            "location-1"
          )
          expect(level.stocked_quantity).toEqual(2)
        })
      })

      describe("retrieveAvailableQuantity", () => {
        let inventoryItem: InventoryItemDTO

        beforeEach(async () => {
          inventoryItem = await service.createInventoryItems({
            sku: "test-sku",
            origin_country: "test-country",
          })
          const inventoryItem1 = await service.createInventoryItems({
            sku: "test-sku-1",
            origin_country: "test-country",
          })

          await service.createInventoryLevels([
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-1",
              stocked_quantity: 4,
            },
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-2",
              stocked_quantity: 4,
            },
            {
              inventory_item_id: inventoryItem1.id,
              location_id: "location-1",
              stocked_quantity: 3,
            },
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-3",
              stocked_quantity: 3,
            },
          ])

          await service.createReservationItems({
            line_item_id: "test",
            inventory_item_id: inventoryItem.id,
            location_id: "location-2",
            quantity: 2,
          })
        })

        it("should calculate current stocked quantity across locations", async () => {
          const level = await service.retrieveAvailableQuantity(
            inventoryItem.id,
            ["location-1", "location-2"]
          )

          expect(level).toEqual(new BigNumber(6))
        })
      })

      describe("retrieveStockedQuantity", () => {
        let inventoryItem: InventoryItemDTO

        beforeEach(async () => {
          inventoryItem = await service.createInventoryItems({
            sku: "test-sku",
            origin_country: "test-country",
          })

          const inventoryItem1 = await service.createInventoryItems({
            sku: "test-sku-1",
            origin_country: "test-country",
          })

          await service.createInventoryLevels([
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-1",
              stocked_quantity: 4,
            },
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-2",
              stocked_quantity: 4,
            },
            {
              inventory_item_id: inventoryItem1.id,
              location_id: "location-1",
              stocked_quantity: 3,
            },
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-3",
              stocked_quantity: 3,
            },
          ])
        })

        it("should retrieve stocked location", async () => {
          const stockedQuantity = await service.retrieveStockedQuantity(
            inventoryItem.id,
            ["location-1", "location-2"]
          )

          expect(stockedQuantity.valueOf()).toEqual(8)
        })
      })

      describe("retrieveReservedQuantity", () => {
        let inventoryItem: InventoryItemDTO

        beforeEach(async () => {
          inventoryItem = await service.createInventoryItems({
            sku: "test-sku",
            origin_country: "test-country",
          })

          const inventoryItem1 = await service.createInventoryItems({
            sku: "test-sku-1",
            origin_country: "test-country",
          })

          await service.createInventoryLevels([
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-1",
              stocked_quantity: 4,
            },
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-2",
              stocked_quantity: 4,
            },
            {
              inventory_item_id: inventoryItem1.id,
              location_id: "location-1",
              stocked_quantity: 3,
            },
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-3",
              stocked_quantity: 3,
            },
          ])

          await service.createReservationItems([
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-2",
              quantity: 2,
            },
            {
              inventory_item_id: inventoryItem1.id,
              location_id: "location-1",
              quantity: 2,
            },
            {
              inventory_item_id: inventoryItem.id,
              location_id: "location-3",
              quantity: 2,
            },
          ])
        })

        it("retrieves reserved quantity", async () => {
          const reservedQuantity = (await service.retrieveReservedQuantity(
            inventoryItem.id,
            ["location-1", "location-2"]
          )) as any

          expect(reservedQuantity + 0).toEqual(2)
        })
      })

      describe("confirmInventory", () => {
        let inventoryItem: InventoryItemDTO

        beforeEach(async () => {
          inventoryItem = await service.createInventoryItems({
            sku: "test-sku",
            origin_country: "test-country",
          })

          await service.createInventoryLevels({
            inventory_item_id: inventoryItem.id,
            location_id: "location-1",
            stocked_quantity: 4,
          })

          await service.createReservationItems({
            inventory_item_id: inventoryItem.id,
            location_id: "location-1",
            quantity: 2,
          })
        })

        it("should return true if quantity is less than or equal to available quantity", async () => {
          const reservedQuantity = await service.confirmInventory(
            inventoryItem.id,
            ["location-1"],
            2
          )

          expect(reservedQuantity).toBeTruthy()
        })

        it("should return false if quantity is more than available quantity", async () => {
          const reservedQuantity = await service.confirmInventory(
            inventoryItem.id,
            ["location-1"],
            3
          )

          expect(reservedQuantity).toBeFalsy()
        })
      })

      describe("stock_status filter", () => {
        let reservedItem: InventoryItemDTO
        let noLevelsItem: InventoryItemDTO
        let lowItem: InventoryItemDTO
        let zeroItem: InventoryItemDTO

        const createWithStock = async (
          sku: string,
          stocked: number,
          extra: Record<string, unknown> = {}
        ) => {
          const item = await service.createInventoryItems({ sku, ...extra })
          await service.createInventoryLevels({
            inventory_item_id: item.id,
            location_id: "location-1",
            stocked_quantity: stocked,
          })
          return item
        }

        // Available = stocked - reserved, summed over locations.
        // Out of stock: available <= 0. Low stock: 0 < available <= threshold.
        beforeEach(async () => {
          // 7 + 5 stocked - 5 reserved = 7: low only because of the reservation
          reservedItem = await createWithStock("reserved", 7)
          await service.createInventoryLevels({
            inventory_item_id: reservedItem.id,
            location_id: "location-2",
            stocked_quantity: 5,
          })
          await service.createReservationItems({
            inventory_item_id: reservedItem.id,
            location_id: "location-2",
            quantity: 5,
          })
          noLevelsItem = await service.createInventoryItems({ sku: "none" })
          lowItem = await createWithStock("low", 3)
          zeroItem = await createWithStock("zero", 0)
          await createWithStock("healthy", 50)
          await createWithStock("threshold-off", 2, { low_stock_threshold: 0 })
        })

        const ids = (items: InventoryItemDTO[]) => items.map((i) => i.id)

        it("lists low stock items, lowest available quantity first", async () => {
          const [items, count] = await service.listAndCountInventoryItems({
            stock_status: "low_stock",
          })

          expect(count).toEqual(2)
          expect(ids(items)).toEqual([lowItem.id, reservedItem.id])
        })

        it("lists out of stock items, including items without levels", async () => {
          const [items, count] = await service.listAndCountInventoryItems({
            stock_status: ["out_of_stock"],
          })

          expect(count).toEqual(2)
          expect(ids(items).sort()).toEqual(
            [noLevelsItem.id, zeroItem.id].sort()
          )
        })

        it("lists both statuses with out of stock items first", async () => {
          const [items, count] = await service.listAndCountInventoryItems({
            stock_status: ["low_stock", "out_of_stock"],
          })

          expect(count).toEqual(4)
          expect(ids(items).slice(0, 2).sort()).toEqual(
            [noLevelsItem.id, zeroItem.id].sort()
          )
          expect(ids(items).slice(2)).toEqual([lowItem.id, reservedItem.id])
        })

        it("paginates in quantity order and counts all matches", async () => {
          const [items, count] = await service.listAndCountInventoryItems(
            { stock_status: "low_stock" },
            { skip: 1, take: 1 }
          )

          expect(count).toEqual(2)
          expect(ids(items)).toEqual([reservedItem.id])
        })

        it("limits the first page to take", async () => {
          const [items, count] = await service.listAndCountInventoryItems(
            { stock_status: "low_stock" },
            { take: 1 }
          )

          expect(count).toEqual(2)
          expect(ids(items)).toEqual([lowItem.id])
        })

        it("keeps the requested relations", async () => {
          const [items] = await service.listAndCountInventoryItems(
            { stock_status: "low_stock", sku: "reserved" },
            { relations: ["location_levels"] }
          )

          expect(items[0].location_levels).toHaveLength(2)
        })

        it("combines with other filters", async () => {
          const [items, count] = await service.listAndCountInventoryItems({
            stock_status: "low_stock",
            sku: "reserved",
          })

          expect(count).toEqual(1)
          expect(ids(items)).toEqual([reservedItem.id])
        })

        it("returns nothing when no items match", async () => {
          const [items, count] = await service.listAndCountInventoryItems({
            stock_status: "low_stock",
            sku: "missing",
          })

          expect(items).toEqual([])
          expect(count).toEqual(0)
        })

        it("applies the filter in listInventoryItems too", async () => {
          const items = await service.listInventoryItems({
            stock_status: "low_stock",
          })

          expect(ids(items)).toEqual([lowItem.id, reservedItem.id])
        })

        it("does not change results when the filter is not set", async () => {
          const [, count] = await service.listAndCountInventoryItems({})

          expect(count).toEqual(6)
        })

        it("rejects an unknown stock status", async () => {
          const error = await service
            .listAndCountInventoryItems({ stock_status: "in_stock" as any })
            .catch((e) => e)

          expect(error.message).toEqual("Invalid stock status: in_stock")
        })

        it("names every unknown stock status", async () => {
          const error = await service
            .listAndCountInventoryItems({
              stock_status: ["in_stock", "low_stock", "unknown"] as any,
            })
            .catch((e) => e)

          expect(error.message).toEqual(
            "Invalid stock status: in_stock, unknown"
          )
        })
      })

      describe("stock_status filter without matching items", () => {
        it("returns nothing when no item has the status", async () => {
          const item = await service.createInventoryItems({ sku: "healthy" })
          await service.createInventoryLevels({
            inventory_item_id: item.id,
            location_id: "location-1",
            stocked_quantity: 50,
          })

          const [items, count] = await service.listAndCountInventoryItems({
            stock_status: ["low_stock", "out_of_stock"],
          })

          expect(items).toEqual([])
          expect(count).toEqual(0)
        })
      })

      describe("stock_status filter with more ids than one query allows", () => {
        // Postgres allows at most 65535 bound parameters per query
        const total = 70000

        beforeEach(async () => {
          // Items without location levels are out of stock
          await MikroOrmWrapper.forkManager().execute(
            `INSERT INTO inventory_item (id, sku) SELECT 'iitem_bulk_' || g, 'bulk-' || g FROM generate_series(1, ${total}) g`
          )
        })

        it("counts and pages all matches without other filters", async () => {
          const [items, count] = await service.listAndCountInventoryItems(
            { stock_status: "out_of_stock" },
            { take: 2 }
          )

          expect(count).toEqual(total)
          expect(items).toHaveLength(2)
        })

        it("combines with other filters", async () => {
          const [items, count] = await service.listAndCountInventoryItems({
            stock_status: "out_of_stock",
            sku: "bulk-70000",
          })

          expect(count).toEqual(1)
          expect(items[0].id).toEqual("iitem_bulk_70000")
        })

        it("lists every match when no page size is given", async () => {
          const items = await service.listInventoryItems(
            { stock_status: "out_of_stock" },
            { select: ["id"] }
          )

          expect(items).toHaveLength(total)
        })
      })
    })
  },
})

import utilsLoader from "../utils"

describe("Utils Loader", () => {
  let containerMock: { register: jest.Mock }

  beforeEach(() => {
    containerMock = {
      register: jest.fn(),
    }
  })

  const getRegisteredRetentionTime = () =>
    containerMock.register.mock.calls[0][0].failedExecutionRetentionTime.resolve()

  describe("failedExecutionRetentionTime option", () => {
    it("should register the option when it is a positive integer", async () => {
      await utilsLoader({
        container: containerMock as any,
        options: { failedExecutionRetentionTime: 86400 },
      })

      expect(getRegisteredRetentionTime()).toEqual(86400)
    })

    it("should register the option when it is 0", async () => {
      await utilsLoader({
        container: containerMock as any,
        options: { failedExecutionRetentionTime: 0 },
      })

      expect(getRegisteredRetentionTime()).toEqual(0)
    })

    it("should register undefined when the option is not set", async () => {
      await utilsLoader({ container: containerMock as any, options: {} })

      expect(getRegisteredRetentionTime()).toBeUndefined()
    })

    it.each([-1, 1.5, 2147483648, "86400", NaN])(
      "should throw when the option is %p",
      async (failedExecutionRetentionTime) => {
        await expect(
          utilsLoader({
            container: containerMock as any,
            options: { failedExecutionRetentionTime } as any,
          })
        ).rejects.toThrow(
          `The workflow engine module option "failedExecutionRetentionTime" must be an integer number of seconds between 0 and 2147483647. Received: ${failedExecutionRetentionTime}`
        )

        expect(containerMock.register).not.toHaveBeenCalled()
      }
    )
  })
})

import { TriangleDownMini } from "@medusajs/icons"
import { ReactNode, useState } from "react"

type CollapsibleBreakdownProps = {
  /** The line of text that opens and closes the list. */
  label: string
  children: ReactNode
}

/**
 * The collapsible list shown under an order line. It was the body of
 * `InventoryKitBreakdown`; a bundle line lists its components the same way
 * (issue #114, AC 6), so the markup lives in one place and both use it.
 */
export const CollapsibleBreakdown = ({
  label,
  children,
}: CollapsibleBreakdownProps) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <div
        onClick={() => setIsOpen((open) => !open)}
        className="flex cursor-pointer items-center gap-2 border-t border-dashed px-6 py-4"
      >
        <TriangleDownMini
          style={{
            transform: `rotate(${isOpen ? 0 : -90}deg)`,
          }}
        />
        <span className="text-ui-fg-muted txt-small select-none">{label}</span>
      </div>
      {isOpen && (
        <div className="flex flex-col gap-1 px-6 pb-4">{children}</div>
      )}
    </>
  )
}

type BreakdownRowProps = {
  /** The component or inventory item being listed. */
  name: ReactNode
  /** What is shown on the right, usually a quantity. */
  value: ReactNode
}

/**
 * One row of a `CollapsibleBreakdown`: a name on the left, a value on the
 * right, and a dashed line joining them.
 */
export const BreakdownRow = ({ name, value }: BreakdownRowProps) => (
  <div className="flex items-center justify-between gap-x-2">
    <div>
      <span className="txt-small text-ui-fg-subtle font-medium">{name}</span>
    </div>
    <div className="relative flex-1">
      <div className="bottom-[calc(50% - 2px)] absolute h-[1px] w-full border-b border-dashed" />
    </div>
    <span className="txt-small text-ui-fg-muted">{value}</span>
  </div>
)

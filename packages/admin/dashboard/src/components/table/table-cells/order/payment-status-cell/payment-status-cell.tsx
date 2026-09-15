import { HttpTypes } from "@medusajs/types"
import { useTranslation } from "react-i18next"
import { ConditionalTooltip } from "../../../../common/conditional-tooltip"
import { getOrderPaymentStatus } from "../../../../../lib/order-helpers"
import { StatusCell } from "../../common/status-cell"

type PaymentStatusCellProps = {
  status: HttpTypes.AdminOrder["payment_status"]
}

export const PaymentStatusCell = ({ status }: PaymentStatusCellProps) => {
  const { t } = useTranslation()

  const { label, color } = getOrderPaymentStatus(t, status)

  return (
    <ConditionalTooltip content={label} showTooltip={!!label}>
      <div className="h-full w-full">
        <StatusCell color={color}>{label}</StatusCell>
      </div>
    </ConditionalTooltip>
  )
}

export const PaymentStatusHeader = () => {
  const { t } = useTranslation()

  return (
    <div className="flex h-full w-full items-center">
      <span className="truncate">{t("fields.payment")}</span>
    </div>
  )
}

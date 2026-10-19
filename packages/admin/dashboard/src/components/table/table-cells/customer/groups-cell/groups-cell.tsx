import { HttpTypes } from "@medusajs/types"
import { Tooltip } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { PlaceholderCell } from "../../common/placeholder-cell"

type GroupsCellProps = {
  groups?: HttpTypes.AdminCustomerGroup[] | null
}

export const GroupsCell = ({ groups }: GroupsCellProps) => {
  const { t } = useTranslation()

  if (!groups || !groups.length) {
    return <PlaceholderCell />
  }

  if (groups.length > 2) {
    return (
      <div className="flex h-full w-full items-center gap-x-1 overflow-hidden">
        <span className="truncate">
          {groups
            .slice(0, 2)
            .map((group) => group.name)
            .join(", ")}
        </span>
        <Tooltip
          content={
            <ul>
              {groups.slice(2).map((group) => (
                <li key={group.id}>{group.name}</li>
              ))}
            </ul>
          }
        >
          <span className="text-xs">
            {t("general.plusCountMore", {
              count: groups.length - 2,
            })}
          </span>
        </Tooltip>
      </div>
    )
  }

  const names = groups.map((group) => group.name).join(", ")

  return (
    <div className="flex h-full w-full max-w-[250px] items-center overflow-hidden">
      <span title={names} className="truncate">
        {names}
      </span>
    </div>
  )
}

export const GroupsHeader = () => {
  const { t } = useTranslation()

  return (
    <div className="flex h-full w-full items-center">
      <span>{t("customers.fields.groups")}</span>
    </div>
  )
}

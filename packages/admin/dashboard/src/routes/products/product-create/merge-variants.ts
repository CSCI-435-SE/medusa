import { ProductCreateSchemaType } from "./types"

type Variant = ProductCreateSchemaType["variants"][number]
type OptionRecord = Record<string, string>

/**
 * Every option title the record names must have the same value in `other`.
 * With `strict`, both records must also name exactly the same options.
 */
const matches = (
  record: OptionRecord,
  other: OptionRecord,
  strict: boolean
) => {
  const keys = Object.keys(record)

  if (strict && keys.length !== Object.keys(other).length) {
    return false
  }

  return keys.every((key) => other[key] === record[key])
}

/**
 * Non-destructive replacement for "regenerate all variants" used by the edit
 * flow.
 *
 * The create flow throws the whole variants array away whenever an option or
 * option value changes, which is fine for a new product but would erase the
 * prices, SKUs, inventory kits and identity of variants that already exist.
 * Instead, this takes the variants currently in the form and the option
 * combinations the form now describes (`permutations`) and reconciles them:
 *
 * 1. A current row whose options equal a combination is kept untouched.
 * 2. A saved row (has `variant_id`) that is missing a value for an option that
 *    was just added is "extended": it takes the first unused combination that
 *    agrees with all of its existing values. Its options record is updated,
 *    everything else is kept. (The backend requires every variant to name a
 *    value for every option, so existing variants must be given one.)
 * 3. A saved row that matches nothing is kept but flagged
 *    `should_create: false`, which the edit flow reads as "delete on save".
 * 4. A not-yet-saved row that matches nothing is dropped.
 * 5. Combinations nobody claimed become new rows.
 *
 * Order of existing rows is preserved; new rows are appended with ranks after
 * the highest existing rank. Existing rows keep their rank so reordering and
 * untouched variants do not produce spurious updates.
 */
export const mergeVariantCombinations = (
  current: Variant[],
  permutations: OptionRecord[]
): Variant[] => {
  const used = new Set<number>()
  const kept: (Variant | undefined)[] = current.map(() => undefined)

  // Pass 1: exact matches keep all their data.
  current.forEach((row, rowIndex) => {
    const permIndex = permutations.findIndex(
      (permutation, i) =>
        !used.has(i) && matches(permutation, row.options, true)
    )

    if (permIndex > -1) {
      used.add(permIndex)
      kept[rowIndex] = { ...row, options: permutations[permIndex] }
    }
  })

  // Pass 2: saved rows that did not match exactly.
  current.forEach((row, rowIndex) => {
    if (kept[rowIndex]) {
      return
    }

    // Unsaved rows that no longer match any combination just disappear.
    if (!row.variant_id) {
      return
    }

    const permIndex = permutations.findIndex(
      (permutation, i) =>
        !used.has(i) &&
        Object.keys(permutation).length > Object.keys(row.options).length &&
        matches(row.options, permutation, false)
    )

    if (permIndex > -1) {
      // Extended with a newly added option: update the record, keep the rest.
      used.add(permIndex)
      kept[rowIndex] = { ...row, options: permutations[permIndex] }
    } else {
      // Its combination no longer exists: mark it for deletion.
      kept[rowIndex] = { ...row, should_create: false }
    }
  })

  const result = kept.filter((row): row is Variant => !!row)

  // Pass 3: combinations nobody claimed become new variants.
  let nextRank = result.reduce(
    (max, row) => Math.max(max, row.variant_rank + 1),
    0
  )

  permutations.forEach((permutation, i) => {
    if (used.has(i)) {
      return
    }

    result.push({
      title: Object.values(permutation).join(" / "),
      options: permutation,
      should_create: true,
      variant_rank: nextRank++,
      inventory: [{ inventory_item_id: "", required_quantity: "" }],
      sku: "",
      manage_inventory: false,
      allow_backorder: false,
      inventory_kit: false,
    })
  })

  return result
}

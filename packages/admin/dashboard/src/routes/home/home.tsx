import { SalesSummarySection } from "./components/sales-summary-section"

/**
 * The dashboard home page (`/app`).
 *
 * This used to immediately redirect to the orders list. For issue #42 it now
 * shows a sales overview so merchants can see how the business is doing at a
 * glance, without clicking through Orders and Products.
 *
 * The panel has a fixed position at the top of the page and isn't
 * dismissible. The wrapper matches the spacing used by `SingleColumnPage`, so
 * more sections can be stacked below it later.
 */
export const Home = () => {
  return (
    <div className="flex flex-col gap-y-3">
      <SalesSummarySection />
    </div>
  )
}

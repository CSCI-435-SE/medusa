import { FindConfig } from "../common"
import { IModuleService } from "../modules-sdk"
import { Context } from "../shared-context"
import { FilterableSubscriptionProps, SubscriptionDTO } from "./common"
import { CreateSubscriptionDTO, UpdateSubscriptionDTO } from "./mutations"

/**
 * The main service interface for the Subscription Module.
 */
export interface ISubscriptionModuleService extends IModuleService {
  /**
   * This method retrieves a subscription by its ID.
   *
   * @param {string} id - The ID of the subscription.
   * @param {FindConfig<SubscriptionDTO>} config - The configurations determining how the subscription is retrieved.
   * @param {Context} sharedContext - A context used to share resources, such as transaction manager, between the application and the module.
   * @returns {Promise<SubscriptionDTO>} The retrieved subscription.
   *
   * @example
   * const subscription = await subscriptionModuleService.retrieveSubscription("sub_123")
   */
  retrieveSubscription(
    id: string,
    config?: FindConfig<SubscriptionDTO>,
    sharedContext?: Context
  ): Promise<SubscriptionDTO>

  /**
   * This method retrieves a paginated list of subscriptions based on optional filters and configuration.
   *
   * @param {FilterableSubscriptionProps} filters - The filters to apply on the retrieved subscriptions.
   * @param {FindConfig<SubscriptionDTO>} config - The configurations determining how the subscriptions are retrieved.
   * @param {Context} sharedContext - A context used to share resources, such as transaction manager, between the application and the module.
   * @returns {Promise<SubscriptionDTO[]>} The list of subscriptions.
   *
   * @example
   * const subscriptions = await subscriptionModuleService.listSubscriptions({
   *   status: "active",
   *   next_billing_at: { $lte: new Date() },
   * })
   */
  listSubscriptions(
    filters?: FilterableSubscriptionProps,
    config?: FindConfig<SubscriptionDTO>,
    sharedContext?: Context
  ): Promise<SubscriptionDTO[]>

  /**
   * This method creates a subscription.
   *
   * @param {CreateSubscriptionDTO} data - The subscription to be created.
   * @param {Context} sharedContext - A context used to share resources, such as transaction manager, between the application and the module.
   * @returns {Promise<SubscriptionDTO>} The created subscription.
   */
  createSubscriptions(
    data: CreateSubscriptionDTO,
    sharedContext?: Context
  ): Promise<SubscriptionDTO>

  /**
   * This method creates subscriptions.
   *
   * @param {CreateSubscriptionDTO[]} data - The subscriptions to be created.
   * @param {Context} sharedContext - A context used to share resources, such as transaction manager, between the application and the module.
   * @returns {Promise<SubscriptionDTO[]>} The created subscriptions.
   */
  createSubscriptions(
    data: CreateSubscriptionDTO[],
    sharedContext?: Context
  ): Promise<SubscriptionDTO[]>

  /**
   * This method updates a subscription.
   *
   * @param {UpdateSubscriptionDTO} data - The attributes to update in the subscription.
   * @param {Context} sharedContext - A context used to share resources, such as transaction manager, between the application and the module.
   * @returns {Promise<SubscriptionDTO>} The updated subscription.
   */
  updateSubscriptions(
    data: UpdateSubscriptionDTO,
    sharedContext?: Context
  ): Promise<SubscriptionDTO>

  /**
   * This method updates subscriptions.
   *
   * @param {UpdateSubscriptionDTO[]} data - The attributes to update in the subscriptions.
   * @param {Context} sharedContext - A context used to share resources, such as transaction manager, between the application and the module.
   * @returns {Promise<SubscriptionDTO[]>} The updated subscriptions.
   */
  updateSubscriptions(
    data: UpdateSubscriptionDTO[],
    sharedContext?: Context
  ): Promise<SubscriptionDTO[]>

  /**
   * This method deletes subscriptions by their IDs.
   *
   * @param {string | string[]} ids - The IDs of the subscriptions to delete.
   * @param {Context} sharedContext - A context used to share resources, such as transaction manager, between the application and the module.
   * @returns {Promise<void>} Resolves when the subscriptions are deleted.
   */
  deleteSubscriptions(
    ids: string | string[],
    sharedContext?: Context
  ): Promise<void>
}

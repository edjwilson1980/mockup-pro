import type { Order } from "./demo/types";

/** The customer can still change the order (not yet with the shop, or sent back for changes). */
export function editable(o: Pick<Order, "status">) {
  return o.status === "draft" || o.status === "changes_requested";
}

/** Order record as the warehouse system reports it. */
export interface Order {
  status: string;
  eta: string;
  total: number;
  refundable: boolean;
}

/** Nightly orders export from the warehouse system, keyed by order id. */
const WAREHOUSE_EXPORT = `{
  "A-1001": { "status": "shipped", "eta": "2026-10-22", "total": 149.99, "refundable": true },
  "A-1002": { "status": "processing", "eta": "2026-10-25", "total": 59.5, "refundable": true },
  "A-1003": { "status": "delivered", "eta": "2026-10-18", "total": 20, "refundable": false }
}`;

/** In-memory stand-in for the orders table, keyed by order id. */
export const ORDERS: Record<string, Order> = JSON.parse(WAREHOUSE_EXPORT);

/** Refund issued against an order. */
export interface Refund {
  orderId: string;
  amount: number;
}

/** In-memory stand-in for the refunds table, keyed by refund id. */
export const REFUNDS: Record<string, Refund> = {};

/** Records a refund and returns its id. Throws if the order is unknown or not refundable. */
export const createRefund = (orderId: string, amount: number): string => {
  const order = ORDERS[orderId];
  if (!order) throw new Error(`Order ${orderId} not found`);
  if (!order.refundable) throw new Error(`Order ${orderId} is not refundable`);
  const refundId = `R-${1001 + Object.keys(REFUNDS).length}`;
  REFUNDS[refundId] = { orderId, amount };
  return refundId;
};

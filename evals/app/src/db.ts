import orders from './orders.json' with { type: 'json' };

/** Order record as the warehouse system reports it. */
export interface Order {
  status: string;
  eta: string;
  total: number;
  refundable: boolean;
}

/** Orders by id, from the warehouse export. */
export const ORDERS: Record<string, Order> = orders;

/** Refund issued against an order. */
export interface Refund {
  orderId: string;
  amount: number;
}

/** Refunds by id. */
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

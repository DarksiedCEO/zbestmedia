import type { DeliveryChannel, DeliveryStatus } from './delivery-router-types.js';

function label(value: string) {
  return value.replace(/_/g, ' ');
}

export function buildDeliveryMessage(args: {
  channel: DeliveryChannel;
  status: DeliveryStatus;
  replayed?: boolean;
}) {
  if (args.replayed || args.status === 'replayed') {
    return `Replayed ${label(args.channel)} delivery result.`;
  }
  if (args.status === 'failed') {
    return `${label(args.channel)} delivery failed.`;
  }
  return `Sent ${label(args.channel)} delivery.`;
}

export function buildDeliveryListMessage(count: number) {
  return count === 1 ? 'Loaded 1 delivery record.' : `Loaded ${count} delivery records.`;
}

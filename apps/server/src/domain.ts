import { Prisma } from "./generated/prisma/client";

export function countAdjustment(snapshot: string | Prisma.Decimal, counted: string | Prisma.Decimal) {
  return new Prisma.Decimal(counted).sub(snapshot);
}

export function receptionOutcome(
  sent: string | Prisma.Decimal,
  received: string | Prisma.Decimal,
  damaged = false
) {
  const sentValue = new Prisma.Decimal(sent);
  const receivedValue = new Prisma.Decimal(received);
  const difference = receivedValue.sub(sentValue);
  return {
    difference,
    hasDifference: damaged || !difference.isZero(),
    status: receivedValue.isZero()
      ? ("NOT_RECEIVED" as const)
      : receivedValue.equals(sentValue)
        ? ("RECEIVED" as const)
        : ("PARTIAL" as const)
  };
}

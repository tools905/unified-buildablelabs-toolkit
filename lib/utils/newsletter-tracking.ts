// What Resend's webhook events mean for a newsletter email and its subscriber.

export const TRACKED_EVENTS = ["email.delivered", "email.bounced", "email.complained", "email.opened", "email.clicked"] as const;
export type TrackedEvent = (typeof TRACKED_EVENTS)[number];

export function isTrackedEvent(type: string): type is TrackedEvent {
  return (TRACKED_EVENTS as readonly string[]).includes(type);
}

export type DeliveryState = {
  status: string;
  delivered_at: string | null;
  first_opened_at: string | null;
  first_clicked_at: string | null;
};

export type DeliveryChanges = {
  patch: Partial<Pick<DeliveryState, "status" | "delivered_at" | "first_opened_at" | "first_clicked_at">>;
  // Set for a hard bounce or a spam complaint: that subscriber is never emailed again.
  subscriberStatus: "bounced" | "complained" | null;
};

// Opens and clicks only record the first time, since the Sends page counts unique readers. An
// open or click also proves the email arrived, in case the "delivered" event comes later.
export function deliveryChangesForEvent(
  delivery: DeliveryState,
  event: { type: TrackedEvent; occurredAt: string; bounceType?: string | null },
): DeliveryChanges {
  const patch: DeliveryChanges["patch"] = {};
  const markDelivered = () => {
    if (!delivery.delivered_at) patch.delivered_at = event.occurredAt;
    if (delivery.status === "sent") patch.status = "delivered";
  };

  switch (event.type) {
    case "email.delivered":
      markDelivered();
      return { patch, subscriberStatus: null };
    case "email.opened":
      markDelivered();
      if (!delivery.first_opened_at) patch.first_opened_at = event.occurredAt;
      return { patch, subscriberStatus: null };
    case "email.clicked":
      markDelivered();
      if (!delivery.first_clicked_at) patch.first_clicked_at = event.occurredAt;
      return { patch, subscriberStatus: null };
    case "email.bounced":
      // A temporary bounce (full mailbox, server down) is retried by Resend; only a permanent
      // one stops future emails.
      if (event.bounceType?.toLowerCase() === "transient") return { patch, subscriberStatus: null };
      return { patch: { status: "bounced" }, subscriberStatus: "bounced" };
    case "email.complained":
      return { patch: { status: "complained" }, subscriberStatus: "complained" };
  }
}

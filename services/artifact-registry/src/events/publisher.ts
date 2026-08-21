import type { NatsConnection, PublishOptions } from "nats";
import { StringCodec } from "nats";
import { AnyArtifactEvent } from "./contracts.js";

const sc = StringCodec();

export function publishEvent(nc: NatsConnection, subject: string, evt: unknown, options?: PublishOptions) {
  nc.publish(subject, encodeEvent(evt), options);
}

export function encodeEvent(evt: unknown): Uint8Array {
  const parsed = AnyArtifactEvent.safeParse(evt);
  if (!parsed.success) {
    throw new Error(
      `Invalid event payload: ${parsed.error.issues.map((iss) => `${iss.path.join(".")}:${iss.message}`).join("; ")}`
    );
  }
  return sc.encode(JSON.stringify(parsed.data));
}

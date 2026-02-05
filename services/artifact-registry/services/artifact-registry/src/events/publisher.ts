import type { NatsConnection } from "nats";
import { StringCodec } from "nats";
import { AnyArtifactEvent } from "./contracts.js";

const sc = StringCodec();

export function publishEvent(nc: NatsConnection, subject: string, evt: unknown) {
  const parsed = AnyArtifactEvent.safeParse(evt);
  if (!parsed.success) {
    throw new Error(
      `Invalid event payload: ${parsed.error.issues.map(i => `${i.path.join(".")}:${i.message}`).join("; ")}`
    );
  }
  nc.publish(subject, sc.encode(JSON.stringify(parsed.data)));
}

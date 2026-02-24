import crypto from "node:crypto";

import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

declare module "fastify" {
  interface FastifyRequest {
    requestId: string;
  }
}

const requestIdPluginImpl: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", async (req) => {
    const header = req.headers["x-request-id"];
    const requestId = typeof header === "string" && header.trim().length > 0 ? header.trim() : crypto.randomUUID();

    req.requestId = requestId;
    req.log = req.log.child({ requestId });
  });

  app.addHook("onSend", async (req, reply, payload) => {
    reply.header("x-request-id", req.requestId);
    return payload;
  });
};

export const requestIdPlugin = fp(requestIdPluginImpl, {
  name: "request-id-plugin"
});

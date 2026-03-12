import { jwtVerify } from "jose";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";

const ClaimsSchema = z.object({
  tenantId: z.string().uuid(),
  sub: z.string().min(1),
  roles: z.array(z.string().min(1))
});

export type AuthContext = {
  tenantId: string;
  actorId: string;
  roles: string[];
};

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext;
  }
}

type AuthPluginOptions = { jwtSecret: string };

const authPluginImpl: FastifyPluginAsync<AuthPluginOptions> = async (app, opts) => {
  const key = new TextEncoder().encode(opts.jwtSecret);
  const publicPaths = new Set(["/healthz"]);

  app.addHook("preHandler", async (req, reply) => {
    const requestPath = req.url.split("?", 1)[0] ?? req.url;
    if (publicPaths.has(requestPath)) {
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "missing_bearer_token" });
    }

    const token = authHeader.slice("Bearer ".length).trim();
    try {
      const { payload } = await jwtVerify(token, key);
      const parsed = ClaimsSchema.safeParse(payload);
      if (!parsed.success) {
        return reply.code(401).send({ error: "invalid_token_claims" });
      }

      const auth: AuthContext = {
        tenantId: parsed.data.tenantId,
        actorId: parsed.data.sub,
        roles: parsed.data.roles
      };
      req.auth = auth;
      req.log = req.log.child({
        tenantId: auth.tenantId,
        actorId: auth.actorId
      });
    } catch {
      return reply.code(401).send({ error: "invalid_token" });
    }
  });
};

export const authPlugin = fp(authPluginImpl, {
  name: "auth-plugin"
});

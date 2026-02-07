import { z } from "zod";
import { http } from "../lib/http";

export const brandSummarySchema = z.object({
  id: z.string(),
  tenantId: z.string().optional(),
  name: z.string(),
  createdAt: z.string().optional()
});

export const graphNodeSchema = z.object({
  id: z.string(),
  type: z.union([z.literal("brand"), z.literal("artifact")]),
  label: z.string()
});

export const graphEdgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  type: z.literal("ARTIFACT_LINKED"),
  createdAt: z.string(),
  eventId: z.string().optional(),
  label: z.string().optional(),
  kind: z.string().optional(),
  animated: z.boolean().optional()
});

export const graphSnapshotSchema = z.object({
  brandId: z.string(),
  nodes: z.array(graphNodeSchema).default([]),
  edges: z.array(graphEdgeSchema).default([]),
  generatedAt: z.string(),
  nextCursor: z.string().nullable()
});

export const graphSnapshotMetaSchema = z.object({
  eventId: z.string(),
  createdAt: z.string()
});

export const graphSnapshotListSchema = z.object({
  brandId: z.string(),
  snapshots: z.array(graphSnapshotMetaSchema).default([]),
  nextCursor: z.string().nullable()
});

export type BrandSummary = z.infer<typeof brandSummarySchema>;
export type Brand = BrandSummary;
export type GraphNode = z.infer<typeof graphNodeSchema>;
export type GraphEdge = z.infer<typeof graphEdgeSchema>;
export type BrandGraph = z.infer<typeof graphSnapshotSchema>;
export type GraphSnapshotMeta = z.infer<typeof graphSnapshotMetaSchema>;
export type GraphSnapshotList = z.infer<typeof graphSnapshotListSchema>;

export const brandgraphContracts = {
  listBrands: {
    path: "/brandgraph/brands",
    response: z.array(brandSummarySchema)
  },
  getGraph: {
    path: (brandId: string) => `/brandgraph/graph/${encodeURIComponent(brandId)}`,
    response: graphSnapshotSchema
  },
  getSnapshots: {
    path: (brandId: string) => `/brandgraph/graph/${encodeURIComponent(brandId)}/snapshots`,
    response: graphSnapshotListSchema
  }
};

export const brandgraphKeys = {
  brands: {
    all: () => ["brandgraph", "brands"] as const,
    detail: (brandId: string) => ["brandgraph", "brands", brandId] as const
  },
  graph: (brandId: string) => ["brandgraph", "graph", brandId] as const,
  snapshots: (brandId: string) => ["brandgraph", "snapshots", brandId] as const
};

export const brandgraphApi = {
  brands: {
    list: async (): Promise<BrandSummary[]> => {
      const response = await http<unknown>(brandgraphContracts.listBrands.path);
      return brandgraphContracts.listBrands.response.parse(response);
    }
  },
  graph: {
    get: async (brandId: string): Promise<BrandGraph> => {
      const response = await http<unknown>(brandgraphContracts.getGraph.path(brandId));
      return brandgraphContracts.getGraph.response.parse(response);
    }
  },
  snapshots: {
    list: async (brandId: string): Promise<GraphSnapshotList> => {
      const response = await http<unknown>(brandgraphContracts.getSnapshots.path(brandId));
      return brandgraphContracts.getSnapshots.response.parse(response);
    }
  }
};

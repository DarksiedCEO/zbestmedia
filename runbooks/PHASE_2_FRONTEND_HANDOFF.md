# Phase 2 Frontend Handoff Pack

## Scope
This document defines the backend contracts and rules the frontend must honor.

## Tenant Rules (Non-Negotiable)
- All requests must include `x-tenant-id` header.
- Missing or invalid tenant header returns `400`.
- Cross-tenant access returns `404` (no leakage).

## BrandGraph Endpoints

### Create brand
- `POST /brandgraph/brands`
- Headers: `x-tenant-id: <tenant>`
- Body: `{ "tenantName": string, "brandName": string }`
- Returns: `201` with `{ id, tenantId }`

### Get brand
- `GET /brandgraph/brands/:id`
- Headers: `x-tenant-id`
- Returns: `200` with brand or `404` if not found in tenant

### Link artifact
- `POST /brandgraph/brands/:id/artifacts/link`
- Headers: `x-tenant-id`
- Body: `{ "artifactId": string, "artifactType"?: string }`
- Idempotent by `(brandId, artifactId)`
- Returns: `200` with link payload

### Graph snapshot
- `GET /brandgraph/brands/:id/graph`
- Headers: `x-tenant-id`
- Query: `limit`, `cursor`
- Returns: `{ brandId, nodes, edges, generatedAt, nextCursor }`

### Graph snapshots list
- `GET /brandgraph/brands/:id/graph/snapshots`
- Headers: `x-tenant-id`
- Query: `limit`, `cursor`
- Returns: `{ brandId, snapshots, nextCursor }`

## Cursor Semantics
- Cursor is exclusive.
- If cursor is invalid or not found, return `400`.
- `nextCursor` is `null` when no more results.

## Determinism
- Nodes and edges are ordered deterministically (by id) within a response.
- Snapshots are ordered newest-first.

## Do Not Bypass
- Do not call BrandGraph without tenant header.
- Do not treat 404 as permission denied; it is the safe failure mode.

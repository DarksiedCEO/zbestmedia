export type Brand = {
  id: string;
  tenantId: string;
  name: string;
  createdAt: string;
};

export type GraphEvent = {
  id: string;
  tenantId: string;
  brandId?: string | null;
  eventType: string;
  payload: unknown;
  createdAt: string;
};

export interface BrandGraphRepo {
  createBrand(input: { id: string; tenantId: string; name: string }): Promise<Brand>;
  getBrand(id: string): Promise<Brand | null>;
  createEvent(input: Omit<GraphEvent, "createdAt">): Promise<GraphEvent>;
  findEventByBrand(brandId: string, eventType: string): Promise<GraphEvent | null>;
}

export function createInMemoryRepo(): BrandGraphRepo {
  const brands = new Map<string, Brand>();
  const events: GraphEvent[] = [];

  return {
    async createBrand({ id, tenantId, name }) {
      const now = new Date().toISOString();
      const brand: Brand = { id, tenantId, name, createdAt: now };
      brands.set(id, brand);
      return brand;
    },
    async getBrand(id) {
      return brands.get(id) ?? null;
    },
    async createEvent(input) {
      const now = new Date().toISOString();
      const event: GraphEvent = { ...input, createdAt: now };
      events.push(event);
      return event;
    },
    async findEventByBrand(brandId, eventType) {
      return events.find((evt) => evt.brandId === brandId && evt.eventType === eventType) ?? null;
    }
  };
}

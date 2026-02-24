export type MemoryLink = {
  sourceId: string;
  targetId: string;
  relation: string;
};

export type MemorySnapshot = {
  snapshotId: string;
  brandId: string;
  createdAt: string;
  links: MemoryLink[];
};

export interface BrandMemorySpine {
  writeSnapshot(snapshot: MemorySnapshot): Promise<void>;
  readLatest(brandId: string): Promise<MemorySnapshot | null>;
}

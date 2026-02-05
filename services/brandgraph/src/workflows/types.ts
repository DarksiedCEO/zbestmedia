export type WorkflowContext = {
  tenantId: string;
  brandId: string;
};

export type WorkflowStep = (ctx: WorkflowContext) => Promise<void>;

export type Workflow = {
  name: string;
  steps: WorkflowStep[];
};

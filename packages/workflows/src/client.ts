import { EventSchemas, Inngest } from "inngest";

type ExecutionCreated = {
  data: { executionId: string };
};

type ExecutionDecision = {
  data: {
    executionId: string;
    decision: "APPROVE" | "REJECT" | "REQUEST_CHANGES";
    note?: string;
    decidedBy?: string;
  };
};

type ExecutionCancelled = {
  data: { executionId: string };
};

export type CadenceAIEvents = {
  "execution/created": ExecutionCreated;
  "execution/decision": ExecutionDecision;
  "execution/cancelled": ExecutionCancelled;
};

export const inngest = new Inngest({
  id: "cadenceai",
  schemas: new EventSchemas().fromRecord<CadenceAIEvents>(),
});

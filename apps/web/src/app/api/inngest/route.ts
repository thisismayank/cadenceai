import { serve } from "inngest/next";
import { cadenceaiInngestFunctions, inngest } from "@/lib/providers";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: cadenceaiInngestFunctions,
});

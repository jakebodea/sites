declare module "virtual:published-content" {
  import type { FreshPlan } from "@jakebodea/cloudflare-kit/emdash/published-content";
  const plan: FreshPlan | null;
  export default plan;
}

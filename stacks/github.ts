/**
 * CI control plane, as code: the repository's GitHub environments, the `main`
 * ruleset, and scoped, expiring Cloudflare deploy tokens written into those
 * environments as secrets. GitHub never holds a token a human pasted.
 *
 *   ALCHEMY_PROFILE=admin bun alchemy deploy stacks/github.ts --stage ci
 *
 * Needs an Alchemy profile that can create Cloudflare API tokens and a GitHub
 * login (`gh auth login`). Deploy once per repository, again to rotate.
 */
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import { Effect, Layer } from "effect";

import { deployTokens, repository } from "./config.ts";

/** What every site's Alchemy stack creates, on every stage. */
const sitePermissions: Cloudflare.ApiToken.PermissionGroupRef[] = [
  "Account Settings Read",
  "Workers Scripts Write",
  "Workers KV Storage Write",
  "Workers R2 Storage Write",
  "D1 Write",
  "Images Write",
  "Turnstile Sites Write",
  "Email Sending Write",
  "Workers Observability Write",
  // The shared Alchemy state store keeps its bearer token in the account Secrets Store.
  "Secrets Store Write",
];

/** Production also attaches custom domains to the site zones. */
const productionPermissions: Cloudflare.ApiToken.PermissionGroupRef[] = [
  // Rum site creation is expected to require this; the first production deploy must verify it.
  "Account Settings Write",
  "Zone Read",
  "DNS Write",
  "Workers Routes Write",
];

const account = { [`com.cloudflare.api.account.${repository.accountId}`]: "*" };

interface DeployEnvironment {
  readonly id: string;
  readonly name: string;
  readonly branches: { customBranchPolicies: string[] } | null;
  readonly permissions: Cloudflare.ApiToken.PermissionGroupRef[];
}

const environments: DeployEnvironment[] = [
  {
    branches: null,
    id: "Preview",
    name: "preview",
    permissions: sitePermissions,
  },
  {
    // Merging to main is the approval; only main may deploy production.
    branches: { customBranchPolicies: ["main"] },
    id: "Production",
    name: "production",
    permissions: [...sitePermissions, ...productionPermissions],
  },
];

const ciOnly = Layer.unwrap(
  Alchemy.Stage.pipe(
    Effect.flatMap((stage) =>
      stage === "ci"
        ? Effect.succeed(Cloudflare.state())
        : Effect.die(
            new Error(`stacks/github.ts only deploys --stage ci (got ${stage})`)
          )
    )
  )
);

export default Alchemy.Stack(
  "marketing-ci",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()),
    state: ciOnly,
  },
  Effect.gen(function* controlPlane() {
    const { owner } = repository;
    const repo = repository.repository;
    yield* GitHub.Label("PreviewLabel", {
      color: "0e8a16",
      description: "Deploy affected sites to a PR preview environment",
      name: "preview",
      owner,
      repository: repo,
    });
    for (const environment of environments) {
      const githubEnvironment = yield* GitHub.Environment(
        `${environment.id}Environment`,
        {
          deploymentBranchPolicy: environment.branches ?? undefined,
          name: environment.name,
          owner,
          repository: repo,
        }
      );
      const token = yield* Cloudflare.ApiToken.AccountApiToken(
        `${environment.id}DeployToken${deployTokens.generation}`,
        {
          accountId: repository.accountId,
          expiresOn: deployTokens.expiresOn,
          name: `${repo}-${environment.name}-deploy-g${deployTokens.generation}`,
          policies: [
            {
              effect: "allow",
              permissionGroups: environment.permissions,
              resources: account,
            },
          ],
        }
      );
      yield* GitHub.Secret(`${environment.id}CloudflareToken`, {
        environment: githubEnvironment,
        name: "CLOUDFLARE_API_TOKEN",
        owner,
        repository: repo,
        value: token.value,
      });
      if (environment.name === "production") {
        const analyticsToken = yield* Cloudflare.ApiToken.AccountApiToken(
          `AnalyticsReadToken${deployTokens.generation}`,
          {
            accountId: repository.accountId,
            expiresOn: deployTokens.expiresOn,
            name: `${repo}-analytics-read-g${deployTokens.generation}`,
            policies: [
              {
                effect: "allow",
                permissionGroups: ["Account Analytics Read"],
                resources: account,
              },
            ],
          }
        );
        yield* GitHub.Secret("ProductionAnalyticsToken", {
          environment: githubEnvironment,
          name: "CF_ANALYTICS_API_TOKEN",
          owner,
          repository: repo,
          value: analyticsToken.value,
        });
      }
      yield* GitHub.Variable(`${environment.id}CloudflareAccount`, {
        environment: githubEnvironment,
        name: "CLOUDFLARE_ACCOUNT_ID",
        owner,
        repository: repo,
        value: repository.accountId,
      });
    }
    // Repo-level (job `if:` conditions cannot see environment variables): CI's deploy jobs
    // skip until this stack has created the environments and tokens above.
    yield* GitHub.Variable("DeploysEnabled", {
      name: "DEPLOYS_ENABLED",
      owner,
      repository: repo,
      value: "true",
    });
    yield* GitHub.Ruleset("MainRuleset", {
      conditions: { include: ["refs/heads/main"] },
      enforcement: "active",
      name: "main",
      owner,
      repository: repo,
      rules: {
        pullRequest: { requiredApprovingReviewCount: 0 },
        requiredStatusChecks: {
          checks: [{ context: "check" }],
          strictRequiredStatusChecksPolicy: true,
        },
      },
      target: "branch",
    });
    return {
      environments: environments.map((environment) => environment.name),
    };
  })
);

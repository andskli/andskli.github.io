+++
title = "Self-service Kubernetes training labs with Innovation Sandbox on AWS"
date = 2026-06-11
description = "Build self-service Kubernetes training labs with Innovation Sandbox on AWS and Terraform — vend dedicated EKS accounts that reset themselves on lease expiry."
draft = false
[taxonomies]
categories = ["kubernetes", "AWS"]
tags = ["kubernetes", "AWS", "training", "terraform", "platform-engineering", "internal-developer-platform"]
[extra]
toc = true
cc_license = false
+++

If you run a platform team that provides Kubernetes to product developers, chances are that you have hit this problem: your team becomes the bottleneck for onboarding. Developers need hands-on experience with your platform, but you can't run workshops every week, and even if you do, you need tooling to help facilitate learning in a safe, hands-on environment.

This post describes a pattern for building self-service Kubernetes training labs using [Innovation Sandbox on AWS](https://aws.amazon.com/solutions/implementations/innovation-sandbox-on-aws/), Terraform, and a thin CloudFormation shim. The result: learners request a lab and get a dedicated account in minutes — running the EKS setup you actually ship, not a generic cluster — and the account is automatically cleaned up when they're done.

<!-- more -->

## The problem

Platform teams that run Kubernetes internally face a scaling challenge with developer enablement:

- **Documentation isn't enough.** Developers need to break things in a real cluster to learn. Hands-on experience beats reading docs.
- **You can't be in every room.** Running instructor-led workshops doesn't scale past a handful of sessions per year.
- **Shared environments create more problems than they solve.** Learners step on each other, leftover resources accumulate, and the environment drifts from its intended state. By the time the next cohort arrives, nothing works like the instructions describe — and troubleshooting someone else's leftovers isn't the learning experience you designed.

What you want is a vending machine for sandbox AWS accounts: a developer requests a lab, gets a dedicated AWS account with the infrastructure that's part of the lab, does the exercises, and the account resets itself when the lease expires.

## The building blocks

You could build this account-vending machine yourself, but it's undifferentiated heavy lifting. [Innovation Sandbox on AWS](https://aws.amazon.com/solutions/implementations/innovation-sandbox-on-aws/) already does it — an open-source AWS Solution (CDK-deployable) that manages a pool of pre-provisioned AWS accounts. Key concepts:

- **Account pool:** A set of AWS accounts in an Organizations OU, sitting idle until leased.
- **Lease:** A time-boxed assignment of an account to a user, with SSO access.
- **Lease template:** Governance rules — duration, approval workflow.
- **Blueprint:** A CloudFormation StackSet that deploys infrastructure into the account when a lease is granted.
- **Cleanup:** When the lease ends, Innovation Sandbox on AWS recycles the account with its Account Cleaner — a multi-pass [`aws-nuke`](https://github.com/ekristen/aws-nuke) sweep — and returns it to the pool. The blueprint is _not_ gracefully deleted first; see [Teardown](#teardown).

The Blueprint feature is what makes this work for training labs. Instead of handing learners a blank account and a piece of paper with some documentation, you give them an account that already has the lab infrastructure running.

Blueprints are CloudFormation StackSets, but the infrastructure you actually want to stand up — the opinionated EKS configuration that defines how Kubernetes runs at your company — is rarely written purely in CloudFormation. It's more likely Terraform, CDK, or Pulumi: the same modules you already use to provision production clusters, with their networking policies, add-ons, RBAC defaults, and observability stacks. We bridge that gap with a thin CloudFormation wrapper that bootstraps a CodeBuild project to run _any_ provisioning code when the lease is granted.

{{ d2(src="/img/diagrams/self-service-k8s-training-labs/building-blocks.svg", caption="Each layer builds on the one below — Innovation Sandbox on AWS vends the account, a Blueprint deploys the CodeBuild shim, and the shim applies your Terraform.") }}

The Blueprint StackSet deploys a handful of resources ([example template](https://github.com/andskli/innovation-sandbox-eks-example-blueprint)), importantly:

1. **IAM role** — the CodeBuild execution role that runs your provisioning code. The example template ships with broader permissions than any single lab needs, to stay lab- and tool-agnostic; for production, scope it down to what your lab actually provisions. [IAM Access Analyzer policy generation](https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-policy-generation.html) can produce a least-privilege policy from the role's CloudTrail activity after a representative run.
2. **Workspace bucket** (custom resource) — manages an S3 bucket in the sandbox account for working state (e.g., Terraform state) or other lease-scoped scratch space. Creates the bucket on stack creation and handles clean deletion on stack teardown.
3. **CodeBuild project** — runs your provisioning code. The lab lifecycle only needs the provisioning path (`buildspec-create.yml`); a `buildspec-destroy.yml` also ships for manual teardown (see [Teardown](#teardown)). Source is an S3 artifact bundle (zip) in a central bucket _you_ create and populate — Innovation Sandbox on AWS doesn't provision it; you point the Blueprint's `SourceBucket`/`SourceKey` parameters at an artifact your CI publishes. Because CodeBuild runs _in the sandbox account_, reading that bucket is a cross-account operation — see [Getting the source into the sandbox account](#getting-the-source-into-the-sandbox-account) for how to grant it safely. No VCS connectivity is required in the sandbox accounts.
4. **Lab provisioner** (custom resource) — on stack CREATE it triggers a Step Functions state machine that starts CodeBuild, polls for completion, and reports the result back to CloudFormation. The DELETE path runs the same way for manual teardown, though Innovation Sandbox on AWS recycles with aws-nuke instead — see [Teardown](#teardown). UPDATE is a no-op: lab infrastructure is immutable, and Innovation Sandbox on AWS never updates a deployed blueprint mid-lease — to change it, recycle the account and re-lease.

Step Functions handles the wait because infrastructure provisioning can take longer than Lambda's 15-minute maximum execution time. The pattern is agnostic to what runs inside CodeBuild — Terraform, CDK, Pulumi, or a plain bash script.

One timeout to mind: Innovation Sandbox on AWS gives each blueprint its own **deployment timeout** (30 minutes by default, set per blueprint), and treats an overrun as a failed deployment — which terminates the lease and recycles the account, so the learner never gets in. A full EKS build runs ~15–20 minutes, comfortably under 30; if your provisioning is heavier, raise the blueprint's deployment timeout (and the CodeBuild project's own timeout) to match.

For the rest of this post, we'll use Terraform as the example since it's the most common case for platform teams, but the pattern works with anything that has a create and destroy path.

On lease grant, CodeBuild runs `terraform apply`. The learner's account comes up with a fully configured EKS cluster — built exactly the way you run EKS in production, with the right add-ons, networking policies, and guardrails — from the same Terraform modules you use in real environments. Everything should be wired up the way it is in production, so learners exercise the real platform rather than a simplified stand-in. For example, how the learner is then granted cluster access — through EKS access entries, `aws-auth`, or your org's existing SSO/OIDC federation — depends on your platform's identity setup.

Because the same account is leased, recycled, and leased again, your provisioning has to be **idempotent** — it must come up cleanly on a freshly nuked account every time. The trap is fixed, account-scoped names that a cleanup pass can leave behind: a stray `alias/eks/<cluster>` KMS alias or a half-deleted cluster will fail the next `terraform apply`, and Innovation Sandbox on AWS reads that failure as a failed deployment and recycles the account. Derive names per deployment so a second lease never collides with residue from the first.

The workflow then looks something like this:

1. Learner requests lease
2. Innovation Sandbox on AWS assigns learner an account from the pool
3. Blueprint StackSet deploys the CodeBuild provisioning shim
4. Step Functions manages CodeBuild builds
5. CodeBuild runs provisioning of your IaC module
6. Learner uses account for learning, exploring or following predefined instructions
7. Account gets cleaned up and returned to the pool

## Getting the source into the sandbox account

CodeBuild runs _inside the leased sandbox account_, but your provisioning code lives in a central bucket. Because sandbox accounts are deliberately low-trust — learners often have broad permissions inside them — the source distribution has to be read-only, scoped, and private.

Keep a zip file containing the source for your infrastructure module in a bucket in your hub account (where Innovation Sandbox on AWS itself runs), and grant cross-account read with an OU-scoped bucket policy:

```json
{
  "Effect": "Allow",
  "Principal": "*",
  "Action": ["s3:GetObject", "s3:GetObjectVersion"],
  "Resource": "arn:aws:s3:::my-blueprint-source/*",
  "Condition": {
    "ForAnyValue:StringEquals": {
      "aws:PrincipalOrgPaths": ["o-xxxxxxxxxx/r-xxxxxxxxxx/ou-xxxx-xxxxxxxx/"]
    }
  }
}
```

Here, `aws:PrincipalOrgPaths` scopes access to just the sandbox OU. Only accounts in your Innovation Sandbox on AWS account-pool OU can read the source, not the whole Organization. You still avoid enumerating account IDs, so newly recycled accounts work automatically, and Block Public Access stays on. The CodeBuild role needs the matching `s3:GetObject` in its identity policy — scope it to this bucket ARN, not `s3:*`.

Note: if you'd rather grant the entire organization, swap `aws:PrincipalOrgPaths` for `aws:PrincipalOrgID=o-xxxxxxxx`.

A couple of details matter here:

- **Encryption.** If the bucket is SSE-KMS, cross-account reads _also_ need the KMS key policy to grant `kms:Decrypt` to the same principals — the bucket policy alone isn't enough. SSE-S3 (AES256) avoids that second grant entirely; use it unless a customer-managed key is mandated.
- **Versioning.** Name each source zip with a semantic version — `eks-blueprint-1.4.2.zip` — and have every Blueprint reference an exact version key. Publishing `1.5.0` then leaves in-flight leases untouched; you roll a lab forward by bumping the version its Blueprint points at, never by overwriting a `latest` key. S3 object versioning works too, but version-stamped keys are easier to pin from a manifest and reason about.

The source is infrastructure code, not secrets, and the grant is read-only, scoped to a single bucket, and limited to the sandbox OU — so even the broad permissions learners hold _inside_ a sandbox account don't widen it.

It's worth asking whether the state bucket should live in a central account so it survives account cleanup — for this pattern, it shouldn't. The state is only needed during the lease: `terraform apply` writes it on provisioning, and when the lease ends the Account Cleaner's `aws-nuke` sweep deletes the bucket along with everything else in the account. The same holds for any tool that keeps state — keep it in-account. That avoids cross-account IAM, a central tooling account to maintain, and orphaned state files from expired leases. The state is as ephemeral as the lab itself.

## Teardown

Teardown is where I had to correct my own mental model against the docs: **the blueprint doesn't tear itself down, and you shouldn't try to make it.** When a lease ends, Innovation Sandbox on AWS recycles the account in two steps:

1. **It drops the blueprint's StackSet metadata** — a `DeleteStackInstances` call with `RetainStacks=true`, which removes the per-account stack-instance record from the StackSet (keeping the control plane tidy) but deliberately leaves the stack in the sandbox account untouched.
2. **The Account Cleaner wipes the account** — it moves the account to a CleanUp OU and runs [`aws-nuke`](https://github.com/ekristen/aws-nuke) in a CodeBuild job, looping until the account comes back clean (three successful passes by default). That loop is what absorbs the fiddly EKS deletion ordering — load-balancer ENIs, security-group cross-references, PVC finalizers, nodegroups-before-cluster — retrying until it resolves, or quarantining the account for an administrator if it can't.

Because step 1 uses `RetainStacks=true`, CloudFormation never issues a stack delete — so your custom resource's Delete handler, and any `terraform destroy` it would run, is **never invoked during a lease recycle.** aws-nuke owns the actual teardown, and it's built for exactly this. A destroy path in the blueprint buys you nothing here; what matters is that the blueprint provisions cleanly into a freshly recycled account every time, because that's the only path that runs.

So why does the example still ship a `buildspec-destroy.yml` and a Delete handler? **For developing the blueprint itself — not the lease lifecycle.** While you iterate on the lab, you deploy the template as a plain CloudFormation stack, and there `delete-stack` runs an ordered `terraform destroy` to tear your test cluster down cleanly instead of leaving you to nuke or hand-delete it. The same handler covers create-failure rollback: if provisioning fails, CloudFormation rolls the stack back and the Delete handler unwinds whatever got created. Useful on your own account; irrelevant once Innovation Sandbox on AWS is doing the recycling.

## Lab instructions

The blueprint provisions the _environment_ — it doesn't ship the lab guide. Delivering the actual exercises, the steps a learner follows, is out of scope for the pattern, and you almost certainly already have a home for it: an internal wiki, your existing docs platform, or wherever your team keeps its runbooks. Author the instructions there and point learners at their leased account. Keeping the teaching material in the docs tooling you already run means it inherits whatever review and versioning you already have, instead of bolting a new system onto the blueprint.

## Making the flywheel spin

Self-service labs solve the "I need a sandbox" problem, but someone still needs to create the content and support learners who get stuck. The sustainable model is train-the-trainer:

1. **Platform team** authors the labs and Terraform modules (they know the platform best)
2. **First cohort** of product developers goes through the labs with platform team support
3. **Graduates** from the first cohort become internal trainers for their own teams
4. **Platform team** shifts to content maintenance and trainer certification

{{ d2(src="/img/diagrams/self-service-k8s-training-labs/flywheel.svg", caption="The self-reinforcing loop: each cohort's graduates become the next cohort's trainers, seeded once by the platform team.") }}

That's the flywheel: each cohort trains the next, so enablement scales with the organization instead of bottlenecking on the platform team's calendar.

## Summary

The pattern:

- **Innovation Sandbox on AWS** manages the account pool, leases, and lifecycle
- **Blueprints** (CFN StackSets) are thin shims that orchestrate CodeBuild via Step Functions
- **CodeBuild** runs any provisioning/teardown code — Terraform, CDK, Pulumi, or scripts
- **Account Cleaner** — the multi-pass `aws-nuke` sweep Innovation Sandbox on AWS runs at lease end — owns teardown; the blueprint provisions on create and doesn't tear itself down
- **Custom resource + Step Functions** run the provisioning build and report success or failure back to CloudFormation
- **Lab instructions** live in your existing wiki/docs — out of scope for the blueprint
- **Train-the-trainer** scales delivery beyond the platform team

## References

- [Example EKS Blueprint (CFN template + Step Functions + buildspec)](https://github.com/andskli/innovation-sandbox-eks-example-blueprint) — companion code for this post
- [Innovation Sandbox on AWS](https://aws.amazon.com/solutions/implementations/innovation-sandbox-on-aws/)
- [Innovation Sandbox on AWS Blueprints (concepts & definitions)](https://docs.aws.amazon.com/solutions/latest/innovation-sandbox-on-aws/concepts-and-definitions.html)
- [`ekristen/aws-nuke` (actively maintained fork)](https://github.com/ekristen/aws-nuke)
- [EKS cluster deletion guide (AWS re:Post)](https://repost.aws/knowledge-center/eks-delete-cluster-resources)
- [terraform-provider-aws #38887 — ENI cleanup issue](https://github.com/hashicorp/terraform-provider-aws/issues/38887)

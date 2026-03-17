+++
title = "Kubernetes beyond a single cluster"
date = 2026-03-17
[taxonomies]
categories = ["kubernetes", "AWS"]
tags = ["kubernetes", "AWS"]
[extra]
toc = false
cc_license = false
+++

In my day-to-day work, I meet many teams running Kubernetes. A common pattern is to treat a Kubernetes cluster as a single, self-contained unit in their architecture. The cluster becomes the boundary for service discovery, networking, scaling, and sometimes even organizational ownership.

This works well for a while. Until it doesn’t.

This post looks at when the single-cluster pattern is perfectly reasonable, and when it starts to become a structural limitation.

## The “everything cluster” problem

A single cluster is convenient, both operationally and cognitively. But whether you like it or not, it is still a failure domain.

If everything runs inside one cluster, that cluster becomes the universal context in which your applications operate. Applications rely on patterns that only exist inside the cluster, such as Kubernetes service discovery and cluster-local networking. You gain simplicity, but you lose flexibility.

Cluster outages become system outages. Scaling limits become tightly coupled to the behavior of a single control plane and its worker nodes. And those scaling properties can change rapidly in multi-tenant environments.

Imagine a team deploying a queue consumer where each unit of work runs in its own pod. Suddenly hundreds of pods are launching per minute. From the team’s perspective this may look fine, but the behavior now affects the entire cluster: scheduler pressure increases, API server load rises, and node capacity becomes contested.

The scaling pattern of a single application has now become a platform problem.

You might say: _“That’s fine, we run multiple clusters”_. But if clusters are simply partitioned by team or business unit, the fundamental assumption remains unchanged. Each application still treats its cluster as the world. The architectural boundary has not moved — it has just been duplicated.

## A more resilient way to think about clusters

A more robust mental model is to treat Kubernetes clusters as disposable compute capacity.

Clusters can appear and disappear without affecting your ability to serve customers. When you design with this assumption, clusters stop being the platform and instead become an implementation detail.

This is not a new idea, but many organizations still struggle with it in practice. Clusters often accumulate operational gravity over time: upgrades become risky events, migrations require careful planning, and the cluster itself becomes something that teams are afraid to change.

If clusters are treated as disposable, that dynamic changes.

One practical consequence appears during cluster upgrades. Instead of upgrading a critical production cluster in place, you can provision a new cluster, deploy the same workloads, and gradually shift traffic to it. If something goes wrong, traffic can simply be shifted back to the old cluster. Once the new environment is stable, the previous cluster can be decommissioned.

In other words, clusters become replaceable infrastructure rather than long-lived platform components.
Designing systems this way has architectural consequences. If clusters are expected to be replaced, service discovery, traffic routing, and state management can no longer depend on cluster-local constructs. Those capabilities must exist outside the cluster boundary so that workloads can run in multiple clusters at the same time.

Once those concerns are externalized, clusters become far easier to replace, scale, and operate over time.

### Traffic management

The first thing you run into is service discovery. Inside a cluster, applications typically discover each other through Kubernetes DNS using names like: `service.namespace.svc.cluster.local`. That mechanism works only within the cluster.

If your services need to run across multiple clusters — for example during migrations, upgrades, or regional deployments — you need discovery that exists outside Kubernetes.

In practice, this means introducing a stable DNS layer that is independent of any specific cluster. Applications resolve external service names, and the underlying endpoints can shift between clusters without changing the contract.

On AWS, this commonly means using services like:

- **Amazon Route 53** for DNS-based service discovery
- **AWS Application Load Balancers or Network Load Balancers** as stable entry points for services

Each cluster can expose workloads behind its own load balancers, while DNS or a global traffic layer determines where traffic ultimately flows. The important shift is that service identity is no longer tied to a cluster.

Another side effect of externalizing service discovery and traffic routing is that the distinction between north–south and east–west traffic starts to blur.
Inside a single cluster, these traffic patterns are typically handled differently. North–south traffic enters through load balancers or ingress controllers, while east–west traffic relies on Kubernetes service discovery and cluster-local networking.

Once services are discovered through external DNS and exposed through stable endpoints, the patterns begin to converge. Both user traffic and service-to-service traffic can follow the same routing mechanisms.
This creates a more repeatable architecture. Instead of relying on special cluster-local conventions for internal communication, services interact through the same discovery and routing primitives regardless of where they run.
In practice, this means that applications become less dependent on cluster-specific networking behavior and more aligned with platform-level service interfaces.

### State

State is straightforward conceptually, but sometimes harder in practice. The simplest rule is that state should live outside the cluster. Object storage, databases, and queues should exist independently of Kubernetes. Clusters consume these services rather than owning them.

On AWS this usually means relying on managed services such as:

- Amazon S3
- Amazon DynamoDB
- Amazon RDS or Amazon Aurora

This separation makes clusters replaceable. A new cluster can come online and immediately connect to the same underlying data services.

There are exceptions. Some workloads depend on block storage volumes, for example applications using EBS-backed persistent volumes. Databases are the most common example. In those cases, the “disposable cluster” pattern may not apply directly. That is acceptable. Architectural patterns do not need to apply universally to be valuable. If most workloads can be decoupled from cluster lifecycle, the platform becomes significantly more resilient.

Treat the remaining cases as deliberate exceptions.

## Is it worth the effort?

In many cases, yes.

The goal is not complexity for its own sake. The goal is to avoid making a Kubernetes cluster the highest-level abstraction in your architecture. This approach does introduce additional moving parts. You need external service discovery, consistent networking across clusters, and deployment pipelines capable of targeting multiple environments. However, these concerns are generally easier to manage than treating a single cluster as the critical foundation of the entire platform.

When clusters become the platform, everything becomes harder: upgrades, migrations, scaling, and regional expansion. When clusters are just compute capacity, the platform moves to a higher level — networking, DNS, identity, and managed services. Kubernetes simply becomes one way of consuming that platform.

For many applications, that is exactly the role it should play.

## Practical suggestions

If you want to move toward this model incrementally, a few changes can make a significant difference.

First, introduce DNS-based service discovery that is independent of Kubernetes. Services should resolve stable DNS names rather than cluster-local service names.

Second, expose services through managed load balancers instead of relying solely on Kubernetes service networking. On AWS, Application Load Balancers and Network Load Balancers provide stable endpoints that can front services running in multiple clusters.

Third, move state out of the cluster wherever possible. Managed storage and database services dramatically simplify cluster lifecycle management.

Finally, assume that clusters will be replaced. Design deployment pipelines and infrastructure so that creating a new cluster is routine rather than exceptional.

Once that becomes normal, Kubernetes clusters stop being fragile infrastructure and start behaving like what they really are: replaceable compute capacity.

# Security & Compliance

This document covers how credentials, secrets, and access are currently handled in the Expensy deployment, and — since this project stores personal financial data (expense records tied to users) — what would be required to bring it to a genuinely production-ready security posture.

**Status: this deployment is currently a learning/demo build, not production-hardened.** The gaps below are flagged explicitly rather than glossed over, since honestly assessing them is part of running a real system responsibly.

---

## 1. Identity & Access Management (IAM)

- The EKS cluster and node group authenticate via **IAM roles**, not long-lived root credentials or hardcoded access keys. This is Terraform-managed (`terraform-aws-modules/eks/aws`), which provisions a dedicated IAM role per node group with the minimum EKS-required policies attached.
- `enable_cluster_creator_admin_permissions` grants the Terraform-applying identity admin access to the cluster — appropriate for a single-operator project, but in a team/production setting this should be replaced with scoped IAM roles per team member via `aws-auth` / EKS access entries, following least-privilege.
- GitHub Actions authenticates to AWS using an IAM user's access key/secret stored as encrypted GitHub Secrets — a functional but not ideal pattern. **Recommended upgrade:** move to OIDC federation (GitHub → AWS IAM role trust) so no long-lived AWS credentials are stored in GitHub at all.

## 2. Secrets Management

**Current state:**
- Application secrets (Mongo credentials, Redis password, `DATABASE_URI`) are stored as native **Kubernetes Secrets**, created imperatively via `kubectl create secret` rather than committed to the repo in plaintext.
- CI/CD credentials (Docker Hub token, AWS keys) are stored as **GitHub Actions encrypted secrets**, scoped to the repository.
- `.env` files (local dev) are excluded from version control via `.gitignore`.

**Gaps / what real production would require:**
- Kubernetes Secrets are only **base64-encoded, not encrypted**, by default — anyone with `kubectl get secret -o yaml` access to the cluster can trivially decode them. For real user data, these should be backed by **AWS Secrets Manager** or **External Secrets Operator**, with encryption at rest via KMS.
- No secret rotation policy currently exists for database or Redis credentials.
- No audit trail currently exists specifically for *who* accessed which secret and when, beyond general EKS API audit logs.

## 3. Network Security

**Current state:**
- EKS worker nodes run in **private subnets** with no direct public IP; a NAT Gateway handles their outbound internet access.
- The ALB security group only allows inbound `80` (HTTP) and `443` (HTTPS), with unrestricted outbound.
- `endpoint_public_access = true` on the EKS cluster means the Kubernetes API server is reachable from any IP — acceptable for a demo/dev cluster, but should be restricted to specific CIDR ranges (office IP, VPN) in production via `endpoint_public_access_cidrs`.

**Gaps / what real production would require:**
- **No TLS/HTTPS is currently configured** on the frontend or backend LoadBalancers — both serve plain HTTP. All traffic, including any user data in transit, is unencrypted. This is the single most important gap to close before handling real user data: it would require an ACM certificate + ALB Ingress Controller (or a cert-manager + Ingress setup) terminating TLS at the load balancer.
- The **backend is currently exposed directly to the public internet** via its own `LoadBalancer` Service, rather than being reachable only internally (`ClusterIP`) behind the frontend. This was a deliberate trade-off made to work around `NEXT_PUBLIC_API_URL` being a browser-side, build-time value in Next.js. In a hardened setup, API calls should be proxied through the frontend's server (Next.js API routes / rewrites), so only the frontend is public and the backend has no direct internet exposure — reducing attack surface and centralizing rate-limiting/auth at one edge.
- No Web Application Firewall (WAF) or rate limiting is currently in front of either public endpoint.

## 4. Secrets in Kubernetes vs. External Secret Manager

Currently: native Kubernetes Secrets only (see Section 2). For production handling of real financial data, secrets should instead be sourced from **AWS Secrets Manager** and synced into the cluster via the **External Secrets Operator**, giving:
- Encryption at rest via AWS KMS
- Fine-grained IAM-based access control per secret
- Built-in rotation support
- A centralized audit trail (CloudTrail) of every secret access

## 5. Logging & Retention

- EKS control-plane logs (`api`, `audit`, `authenticator`) ship to **CloudWatch Logs**. See [`monitoring/README.md`](./monitoring/README.md) for access details.
- **No explicit retention policy is currently set** on the CloudWatch log group — it defaults to "Never Expire," which is not a deliberate compliance decision, just the AWS default. For production, an explicit retention period should be set (commonly 90 days–1 year for audit logs, depending on applicable regulatory requirements) via `aws logs put-retention-policy`.
- Application-level logs are only accessible via `kubectl logs` while a pod is alive — they are **not currently persisted** anywhere once a pod is deleted or restarted. Production use would require shipping container logs to CloudWatch Container Insights or a centralized log store (ELK/EFK), as noted in the monitoring documentation.
- No log data is currently masked or redacted — if request logs ever include user-submitted data (e.g., expense descriptions), that data would appear in plaintext in logs. This should be addressed via structured logging with explicit PII redaction before any real user data is processed.

## 6. Data Protection

- **Data at rest:** MongoDB currently runs as a plain in-cluster Deployment using `emptyDir` storage — **data is not persisted** across pod restarts, and is **not encrypted at rest**. For production, this should move to a managed, encrypted data store (e.g., MongoDB Atlas with encryption at rest, or Amazon DocumentDB with KMS-backed encryption) backed by durable, encrypted EBS volumes at minimum.
- **Data in transit:** Not currently encrypted (see TLS gap above).
- **Backups:** None currently configured. Production would require scheduled, encrypted, access-controlled backups of the database.

## 7. Compliance Considerations

Since Expensy stores personal financial records (expense amounts, categories, and — depending on future features — potentially names or account details tied to individual users), the following apply if this were handling real user data:

- **GDPR** — if any users are in the EU/EEA, or the operator processes EU residents' data, GDPR applies. This would require: a documented lawful basis for processing, data subject access/deletion capabilities, breach notification procedures, and the data protection measures above (encryption at rest/in transit, access controls, retention limits) at minimum.
- **General data-protection best practice** (even absent a specific regulatory mandate) — financial transaction data is inherently sensitive; the encryption, access-control, and retention gaps above should be treated as required, not optional, before onboarding real users.
- **HIPAA** — not applicable; this app does not process health information.
- **PCI-DSS** — not currently applicable, since Expensy tracks *expenses* rather than processing *payments* or storing card data directly. If payment processing were added later, PCI-DSS scope would need to be reassessed.

**Where user data is currently stored:** MongoDB, running inside the EKS cluster in `us-east-1` (AWS N. Virginia region). No data is currently replicated to other regions.

---

## Summary: Priority Fixes Before Handling Real User Data

1. TLS/HTTPS on all public endpoints (frontend + backend, or eliminate the public backend entirely via a frontend-side proxy)
2. Encrypt Kubernetes Secrets / migrate to AWS Secrets Manager
3. Persistent, encrypted database storage with backups (replace `emptyDir` Mongo)
4. Explicit CloudWatch log retention policy
5. Restrict EKS API server access to known IP ranges
6. Move CI/CD AWS auth to OIDC instead of static access keys
7. Add WAF/rate limiting in front of public endpoints
8. If pursuing real users: formal GDPR compliance review (data subject rights, breach procedures, lawful basis documentation)
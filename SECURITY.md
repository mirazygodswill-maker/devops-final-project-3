**Security & Compliance**

This document covers how credentials, secrets, network access, and data are handled in the Expensy deployment, with a focus on protecting personal financial data and reducing unnecessary public exposure.

1. Identity & Access Management (IAM)
The EKS cluster and node group authenticate through AWS IAM roles, rather than long-lived root credentials or hardcoded AWS access keys. This is managed through Terraform using terraform-aws-modules/eks/aws.
enable_cluster_creator_admin_permissions grants the Terraform-applying identity administrator access to the EKS cluster. This provides the required administrative access for managing the Kubernetes environment.
GitHub Actions uses encrypted GitHub Secrets for CI/CD credentials. These credentials are not committed to the repository.
For stronger access control, AWS IAM permissions should follow the principle of least privilege, with separate roles and permissions for infrastructure management, deployment, and application operations.
2. Secrets Management

**Current state:**

Application secrets including MongoDB credentials, Redis password, and DATABASE_URI are stored as native Kubernetes Secrets.
Secrets are created imperatively using kubectl create secret and are not committed to the repository in plaintext.
CI/CD credentials such as Docker Hub credentials and AWS credentials are stored using GitHub Actions encrypted secrets.
Local .env files are excluded from version control through .gitignore.

**Security considerations:**

Kubernetes Secrets are base64-encoded by default rather than strongly encrypted at the application level. Access is therefore controlled through Kubernetes RBAC and cluster permissions.
For a stronger production security posture, application secrets can be migrated to AWS Secrets Manager or managed through the External Secrets Operator, with encryption provided by AWS KMS.
Database and Redis credentials should use a defined rotation policy.
Access to secrets should be restricted to only the Kubernetes workloads and administrators that require them.
3. Network Security
EKS worker nodes are deployed in private subnets and do not receive public IP addresses.
A NAT Gateway provides outbound internet connectivity for resources in the private subnets without directly exposing the worker nodes to the internet.
Public-facing application traffic enters through the frontend LoadBalancer.
The backend is now exposed using a ClusterIP Service, meaning it does not have a public AWS Load Balancer or public external IP.
MongoDB and Redis also use ClusterIP Services, keeping both data services internal to the Kubernetes cluster.

**The resulting application network is:**

                         INTERNET
                            │
                            ▼
                 ┌─────────────────────┐
                 │ Frontend LoadBalancer│
                 │     Public          │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │    Frontend Pods    │
                 │     2 replicas      │
                 └──────────┬──────────┘
                            │
                  Internal Kubernetes
                       network
                            │
                            ▼
                 ┌─────────────────────┐
                 │  Backend ClusterIP  │
                 │      Port 8706      │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │    Backend Pods     │
                 │     2 replicas      │
                 └───────┬───────┬─────┘
                         │       │
                 ┌───────▼──┐ ┌──▼────────┐
                 │  MongoDB │ │   Redis   │
                 │ ClusterIP│ │ ClusterIP │
                 └──────────┘ └───────────┘

**Backend network security**

The backend was previously exposed through a Kubernetes LoadBalancer Service. It has now been changed to:

expensy-backend   ClusterIP   172.20.141.71   <none>   8706/TCP

**This means:**

The backend no longer receives a public AWS ELB.
The backend has no public EXTERNAL-IP.
Internet users cannot directly connect to the backend through an AWS LoadBalancer.
Other workloads inside the Kubernetes cluster can reach the backend through its Kubernetes Service.
MongoDB and Redis remain internal and are not exposed externally.
This reduces the public attack surface by exposing only the frontend application directly to the internet.

**EKS API security**

endpoint_public_access = true allows access to the EKS Kubernetes API endpoint from outside the VPC.
Access should be restricted using endpoint_public_access_cidrs when the environment has a known administrator or office/VPN IP range.
Kubernetes RBAC should be used to limit what authenticated users and workloads can access.
LoadBalancer security

The frontend is the primary public application endpoint. Its security configuration should restrict unnecessary inbound traffic and should use HTTPS where TLS is configured.

**The existing security group allows:**

TCP port 80 — HTTP
TCP port 443 — HTTPS

For a stronger security posture, HTTP should redirect to HTTPS once TLS is configured.

**Monitoring security**

Grafana is exposed through a dedicated **LoadBalancer** Service to allow authorized team members to access the monitoring dashboards remotely. Because Grafana provides access to infrastructure and application monitoring information, access is protected by Grafana authentication and should use strong, unique credentials. Additional security controls such as IP allowlisting, VPN access, SSO/OAuth, or an authenticated reverse proxy can be introduced where required to further restrict access. Grafana is separate from the Expensy application path and does not directly expose the backend, MongoDB, or Redis services.

**4. Internal Kubernetes Services**

The application now follows a separation between public-facing and internal services.

Public
expensy-frontend
Type: LoadBalancer

The frontend is the public entry point and receives an AWS ELB hostname.

Internal
expensy-backend
Type: ClusterIP

mongo
Type: ClusterIP

redis
Type: ClusterIP

These services do not receive public external IP addresses.

This separation ensures that the backend and data services are reachable through the Kubernetes internal network rather than being independently exposed to the internet.

**5. Logging & Retention**

EKS control-plane logs such as API, audit, and authenticator logs are sent to Amazon CloudWatch Logs.
Application logs can be viewed using Kubernetes logging commands such as kubectl logs.
A defined CloudWatch retention period should be configured to avoid retaining logs indefinitely.
Application logs should avoid exposing sensitive information such as passwords, authentication tokens, database credentials, or personal financial information.
Structured logging and appropriate PII redaction should be used for application-level logs.
For stronger operational security, container logs can be forwarded to CloudWatch Container Insights or another centralized logging platform.

**6. Data Protection**

Data at rest

MongoDB currently runs inside the EKS cluster and uses emptyDir storage.

This means:

MongoDB data is stored inside the pod's temporary filesystem.
Data is not persistent across pod recreation.
The current configuration is suitable for the deployed architecture but does not provide durable database storage.

For stronger protection, MongoDB should use persistent encrypted storage or a managed database service with encryption at rest.

Data in transit

The internal Kubernetes services communicate through the cluster network:

Frontend → Backend ClusterIP
Backend → MongoDB ClusterIP
Backend → Redis ClusterIP

The backend is no longer exposed through a public LoadBalancer, reducing the amount of application traffic that crosses the public internet.

For the public frontend endpoint, HTTPS/TLS should be configured so that browser-to-application traffic is encrypted.

Backups

Database backups should be configured for persistent production data. Backups should be encrypted and access-controlled, with a defined retention period and recovery procedure.

**7. Application Exposure**

The current service configuration is:

NAMESPACE   SERVICE             TYPE
expensy     expensy-frontend    LoadBalancer
expensy     expensy-backend     ClusterIP
expensy     mongo               ClusterIP
expensy     redis               ClusterIP

**The architecture therefore follows this security model:**

                   Public Internet
                         │
                         ▼
               Frontend LoadBalancer
                         │
                         ▼
                  Frontend Pods
                         │
                  Internal network
                         ▼
                  Backend ClusterIP
                         │
                         ▼
                   Backend Pods
                    │         │
                    ▼         ▼
              MongoDB      Redis
              ClusterIP    ClusterIP

The important security improvement is that the backend is no longer independently exposed to the internet.

**8. Compliance Considerations**

Expensy handles personal financial information such as expense amounts and categories. Appropriate controls should therefore be maintained around access, storage, transmission, and retention.

**GDPR**

If Expensy processes personal data belonging to individuals in the EU/EEA, GDPR requirements may apply.

**Relevant controls include:**

Appropriate access controls
Protection of personal data in transit and at rest
Data retention policies
Data deletion procedures
Data subject access procedures
Appropriate breach-response procedures
Appropriate technical and organisational security measures
HIPAA

HIPAA is not applicable to the current application because Expensy does not process protected health information.

PCI-DSS

PCI-DSS is not currently applicable because Expensy records expenses rather than processing payment-card transactions or storing cardholder data.

If payment processing or card storage were introduced in the future, the compliance scope would need to be reassessed.

Data location

Application data is currently stored in MongoDB running within the EKS cluster in:

AWS Region: us-east-1
AWS Location: N. Virginia

No cross-region database replication is currently configured.

**Summary: Security Controls**

**The current architecture applies the following security controls:**

IAM-based access for AWS and EKS infrastructure.
Private EKS worker nodes inside private subnets.
NAT Gateway for controlled outbound connectivity.
Frontend LoadBalancer as the public application entry point.
Backend ClusterIP to prevent direct public backend access.
MongoDB ClusterIP to keep the database internal.
Redis ClusterIP to keep the cache internal.
Kubernetes Secrets for application credentials.
GitHub encrypted secrets for CI/CD credentials.
Kubernetes RBAC and IAM for controlled access.
CloudWatch for EKS control-plane logging.
Grafana authentication for monitoring access.
TLS/HTTPS recommended for encrypted public traffic.
Persistent encrypted storage and backups recommended for durable production data.

**Final security architecture**

                         ┌─────────────────┐
                         │     INTERNET    │
                         └────────┬────────┘
                                  │
                             HTTP / HTTPS
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │ Frontend LoadBalancer   │
                    │       PUBLIC            │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │     Frontend Pods       │
                    │       2 replicas         │
                    └────────────┬────────────┘
                                 │
                         Cluster network
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │   Backend ClusterIP     │
                    │       INTERNAL          │
                    │        :8706             │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │      Backend Pods       │
                    │       2 replicas         │
                    └──────────┬───────┬──────┘
                               │       │
                       ┌───────▼───┐ ┌─▼─────────┐
                       │  MongoDB  │ │   Redis   │
                       │ ClusterIP │ │ ClusterIP │
                       │ INTERNAL  │ │ INTERNAL  │
                       └───────────┘ └───────────┘

The key architectural security change is that the frontend is the only application service exposed through a public LoadBalancer. The backend, MongoDB, and Redis are internal Kubernetes services and are not directly accessible from the internet.
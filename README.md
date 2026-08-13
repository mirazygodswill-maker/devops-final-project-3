# Expensy — End-to-End DevOps Deployment

Expensy is a lightweight expense tracker built with Next.js (frontend) and Node/Express (backend), deployed end-to-end using a full DevOps pipeline: Docker, GitHub Actions CI/CD, Terraform-provisioned AWS EKS, Kubernetes, and Prometheus/Grafana monitoring.

**Presentation**

The project presentation slides are available here:

https://docs.google.com/presentation/d/1aEGBfrzjVIg9KYabwhHj_oKeGtKW8LYffRy8cyMEZWE/edit?usp=sharing

**Expensy-End-toEnd DeVops Deployment Architecture**

<img width="1356" height="784" alt="Gemini_Generated_Image_ubb02qubb02qubb0" src="https://github.com/user-attachments/assets/9e64e372-dc2b-44f0-a7e5-3a45d3246445" />


## Project Structure

```
devops-final-project-3/
├── expensy_frontend/       # Next.js frontend
│   └── Dockerfile.frontend
├── expensy_backend/        # Node/Express backend
│   └── Dockerfile.backend
├── infrastructure/         # Terraform (VPC + EKS)
│   └── main.tf
├── K8s/                    # Kubernetes manifests
│   ├── namespace.yaml
│   ├── mongo.yaml
│   ├── redis.yaml
│   ├── backend.yaml
│   └── frontend.yaml
├── monitoring/              # Prometheus/Grafana config + dashboards
│   ├── prometheus-values.yaml
│   ├── namespace-pods-dashboard.json
│   ├── screenshots/
│   └── README.md
├── docker-compose.yaml
└── .github/workflows/ci-cd.yaml
```

---

## 1. Local Development

<img width="1422" height="266" alt="Screenshot 2026-08-11 152504" src="https://github.com/user-attachments/assets/e91f5175-5e60-44b0-9674-c65ef0828430" />


### Prerequisites
- Docker
- Node.js 20
- AWS CLI (for later steps)

### Start Mongo & Redis

```bash
docker run --name mongo -d -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=root \
  -e MONGO_INITDB_ROOT_PASSWORD=example \
  mongo:latest

docker run --name redis -d -p 6379:6379 \
  redis:latest redis-server --requirepass someredispassword
```

### Backend

`expensy_backend/.env`:
```
PORT=8706
DATABASE_URI=mongodb://root:example@localhost:27017
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=someredispassword
```

```bash
cd expensy_backend
npm install
npm start   # runs tsc build, then node dist/server.js
```

<img width="872" height="127" alt="Screenshot 2026-08-11 153926" src="https://github.com/user-attachments/assets/c076ac08-71e2-427c-9c5e-abda1b67b262" />


### Frontend

`expensy_frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8706
```

```bash
cd expensy_frontend
npm install
npm run dev
```

App runs at `http://localhost:3000`.

---
<img width="925" height="288" alt="Screenshot 2026-08-11 155615" src="https://github.com/user-attachments/assets/f1105d45-b704-4f31-bf01-c4334151aff4" />

<img width="1911" height="1088" alt="Screenshot 2026-08-11 154535" src="https://github.com/user-attachments/assets/493aed38-659d-4078-a24e-b9ad9dd74679" />
<img width="1905" height="875" alt="Screenshot 2026-08-11 154603" src="https://github.com/user-attachments/assets/575944a6-c10e-4f40-bcaa-d091271f5acf" />





### Application
My Expensy frontend was previously running directly on my machine/Docker Desktop, with:
localhost:3002 → frontend container
http://localhost:3002

AWS EKS (Deployed and working) 
The Expensy application is deployed on AWS EKS and is accessible through
the AWS Application Load Balancer:

http://aaaf2fe1f0a5d421298674bc97989bb1-464724746.us-east-1.elb.amazonaws.com/home

<img width="1901" height="965" alt="Screenshot 2026-08-11 170616" src="https://github.com/user-attachments/assets/a30c2e2f-83d5-474a-b9c4-2c21247f7eae" />
<img width="1915" height="647" alt="Screenshot 2026-08-11 170636" src="https://github.com/user-attachments/assets/6a9f6348-b02f-421c-adb5-4ea887c76e31" />





## 2. Containerization

Both services have multi-stage Dockerfiles (`Dockerfile.backend`, `Dockerfile.frontend`) that build the app, then run it in a minimal runtime image.

**Key detail:** `NEXT_PUBLIC_API_URL` is compiled into the frontend's JS bundle at **build time** (not read at runtime), since it's a client-side/browser variable. It must be passed as a Docker build arg:

```bash
docker build \
  --build-arg NEXT_PUBLIC_API_URL=<backend-public-url> \
  -t <image-tag> -f Dockerfile.frontend .
```

<img width="1458" height="927" alt="Screenshot 2026-08-11 160517" src="https://github.com/user-attachments/assets/f689d649-8794-40cd-a5b9-4354b5717f7b" />

<img width="1432" height="337" alt="Screenshot 2026-08-11 160607" src="https://github.com/user-attachments/assets/0af24375-055c-48d8-b306-ad38385ffd7f" />




### Local full-stack via Docker Compose

```bash
docker compose up --build
```

Spins up Mongo, Redis, backend, and frontend together, wired via the internal Docker network.

---

## 3. CI/CD Pipeline

`.github/workflows/ci-cd.yaml` — three jobs:

1. **build-and-test** — installs deps, builds, runs tests for both services (matrix job).
2. **docker-build-push** — builds both images and pushes to **both** Docker Hub and Amazon ECR (hybrid registry setup).
3. **deploy** — gated behind a GitHub **Environment** (`production`) with required reviewers, satisfying the "manual approval before production" requirement. Currently a placeholder step, ready to be replaced with real `kubectl`/`helm` deploy commands.

### Required GitHub Secrets
| Secret | Purpose |
|---|---|
| `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` | Docker Hub push |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` | ECR push |

---

<img width="1887" height="987" alt="Screenshot 2026-08-11 163034" src="https://github.com/user-attachments/assets/bb712366-6c84-4a0d-a791-785b3cbccbe9" />



## 4. Infrastructure (Terraform → EKS)

`infrastructure/main.tf` provisions, via the `terraform-aws-modules` community modules:
- A VPC with public + private subnets, NAT gateway, IGW
- An EKS cluster (v1.33) with a managed node group (`t3.medium`, 2–3 nodes)
- Core cluster addons (`vpc-cni`, `kube-proxy`, `coredns`) — **required** for nodes to reach `Ready` state and for pod networking/DNS to work at all
- An ALB-facing security group for future ingress use

```bash
cd infrastructure
terraform init
terraform plan
terraform apply
```

```bash
aws eks update-kubeconfig --region us-east-1 --name expensy-miracle-eks
kubectl get nodes



```

---
<img width="811" height="132" alt="Screenshot 2026-08-11 163506" src="https://github.com/user-attachments/assets/5f276e08-32e5-4b13-ab0f-f119194cdef9" />


<img width="1813" height="1143" alt="Screenshot 2026-08-11 162547" src="https://github.com/user-attachments/assets/4a2a6e7a-de7d-45c8-a297-c7046a8b752c" />



## 5. Kubernetes Deployment

Manifests in `K8s/`, applied in order:

```bash
kubectl apply -f K8s/namespace.yaml

kubectl create secret generic expensy-secrets \
  --namespace expensy \
  --from-literal=MONGO_ROOT_USERNAME=root \
  --from-literal=MONGO_ROOT_PASSWORD=example \
  --from-literal=REDIS_PASSWORD=someredispassword \
  --from-literal=DATABASE_URI=mongodb://root:example@mongo:27017

kubectl apply -f K8s/mongo.yaml
kubectl apply -f K8s/redis.yaml
kubectl apply -f K8s/backend.yaml
kubectl apply -f K8s/frontend.yaml
```

- `mongo` / `redis` — in-cluster Deployments + `ClusterIP` Services (internal only)
- `expensy-backend` — Deployment + **`LoadBalancer`** Service. Exposed publicly because the frontend's `NEXT_PUBLIC_API_URL` is called directly from the user's browser, not proxied server-side — so the backend needs a reachable public address. (A more production-hardened setup would instead proxy API calls through the frontend server and keep the backend `ClusterIP`-only — noted as a future improvement, see Security section.)
- `expensy-frontend` — Deployment + `LoadBalancer` Service, publicly accessible

```bash
kubectl get pods -n expensy
kubectl get svc expensy-frontend -n expensy
```

Open the `EXTERNAL-IP` shown for `expensy-frontend` in a browser to access the live app.

---
<img width="897" height="227" alt="Screenshot 2026-08-11 163721" src="https://github.com/user-attachments/assets/ffaf251d-dab8-472b-9b3a-df010c011915" />

<img width="1368" height="120" alt="Screenshot 2026-08-11 163848" src="https://github.com/user-attachments/assets/e8cba3a3-faf5-4a65-b42a-f636a5d2ae5e" />





## 6. Monitoring & Logging


- **Prometheus + Grafana** installed via the `kube-prometheus-stack` Helm chart — auto-discovers and scrapes metrics from all cluster pods/nodes.
- Grafana's built-in **Namespace (Pods)** dashboard filtered to the `expensy` namespace shows live CPU/memory for `expensy-backend`, `expensy-frontend`, `mongo`, and `redis`.
- **EKS control-plane logs** (`api`, `audit`, `authenticator`) ship automatically to **CloudWatch Logs** (`/aws/eks/expensy-miracle-eks/cluster`).
- **Application logs** are accessed via `kubectl logs -n expensy -l app=<service>`.

---

## Status

- [x] Local development environment
- [x] Dockerfiles + docker-compose
- [x] CI/CD pipeline (build, test, push to Docker Hub + ECR, manual-approval deploy gate)
- [x] EKS cluster provisioned via Terraform
- [x] Kubernetes manifests deployed (Mongo, Redis, backend, frontend)
- [x] Monitoring (Prometheus/Grafana) + Logging (CloudWatch)
- [ ] Security & Compliance documentation *(next up)*

This covers how metrics monitoring (Prometheus + Grafana) and logging are set up for the Expensy EKS deployment.

## Contents

- `prometheus-values.yaml` — Helm values used to install the `kube-prometheus-stack` chart (Prometheus, Grafana, Alertmanager, node-exporter, kube-state-metrics).
- `namespace-pods-dashboard.json` — Exported Grafana dashboard showing CPU/memory usage per pod in the `expensy` namespace (backend, frontend, mongo, redis).

## Metrics: Prometheus & Grafana

### How it was installed

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

kubectl create namespace monitoring

helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  -f prometheus-values.yaml
```
<img width="1916" height="1057" alt="Screenshot 2026-08-11 123307" src="https://github.com/user-attachments/assets/df963a61-3543-4135-9bbb-fa43a9d4f2ec" />
<img width="1528" height="862" alt="Screenshot 2026-08-13 234207" src="https://github.com/user-attachments/assets/934a82cb-d36b-4d03-b62a-3427b910e70c" />
<img width="1478" height="886" alt="Screenshot 2026-08-13 234437" src="https://github.com/user-attachments/assets/83ad44fb-3a27-4191-a025-c1a3511f4fa4" />
<img width="1458" height="837" alt="Screenshot 2026-08-13 234545" src="https://github.com/user-attachments/assets/5da0f3c1-bcae-4a88-be74-a476455c7dca" />
<img width="1476" height="675" alt="Screenshot 2026-08-13 234616" src="https://github.com/user-attachments/assets/93a55ce6-88d3-43a5-bced-c56c9442c299" />






**Expensy app pods**



<img width="972" height="202" alt="Screenshot 2026-08-11 123436" src="https://github.com/user-attachments/assets/3f2e930c-950b-42c6-8ea2-d65d3615e9cf" />


This deploys:
- **Prometheus** — scrapes metrics from all pods/nodes in the cluster automatically via `kube-state-metrics` and `node-exporter` (no manual instrumentation needed for basic CPU/memory/pod-status metrics).
- **Grafana** — dashboards for visualizing the above. Comes pre-loaded with a set of standard Kubernetes dashboards (cluster overview, per-namespace pod resources, per-node resources, etc.).
- **Alertmanager** — routes alerts (not configured with external notification channels yet — alerts fire internally but aren't piped to Slack/email/etc. This would be the next step for a production setup).
- **node-exporter** — one per node, exposes host-level metrics (CPU, memory, disk, network).

### Accessing Grafana

Grafana isn't exposed publicly by default. To access it:

```bash
kubectl port-forward -n monitoring svc/monitoring-grafana 3001:80
```

Then open `http://localhost:3001` in your browser.

**Login:**
- Username: `admin`
- Password: set at install time via `grafana.adminPassword` in `prometheus-values.yaml`. **Note:** if you've changed the password since via Grafana's UI (Profile → Change Password), that change is stored in Grafana's own database, not reflected in this file — the file only shows the original install-time value.

### Viewing app-specific metrics

Once logged in:
1. Go to **Dashboards** in the sidebar
2. Open **Kubernetes / Compute Resources / Namespace (Pods)**
3. Select `expensy` from the namespace dropdown at the top

This shows live CPU and memory usage for `expensy-backend`, `expensy-frontend`, `mongo`, and `redis` pods specifically.

### Re-importing the exported dashboard

If setting this up fresh (new cluster, new Grafana instance), the dashboard is already included in the default `kube-prometheus-stack` install — no manual import needed. The exported JSON in this repo is provided as the deliverable/reference copy, and can also be manually imported via **Dashboards → New → Import** in Grafana if needed.

## Logging

### EKS control plane logs (CloudWatch)

Control plane logging is enabled via the EKS cluster configuration (Terraform-managed) for:
- `api` — Kubernetes API server logs
- `audit` — audit trail of all API requests (who did what, when)
- `authenticator` — IAM authentication logs

These are sent automatically to **Amazon CloudWatch Logs**, under the log group:
```
/aws/eks/expensy-miracle-eks/cluster
```

**To view them:**
```bash
aws logs tail /aws/eks/expensy-miracle-eks/cluster --follow --region us-east-1
```

Or via the AWS Console: **CloudWatch → Log groups → `/aws/eks/expensy-miracle-eks/cluster`**

`controllerManager` and `scheduler` logs are currently disabled (not needed for this project's scope, but can be enabled the same way if deeper cluster-internals debugging is needed later).

<img width="1888" height="1052" alt="Screenshot 2026-08-11 130711" src="https://github.com/user-attachments/assets/8730e47e-67e4-4153-8ae8-6fc3b6e2fcfe" />


### Application (pod) logs

Application-level logs (from the frontend/backend containers themselves) are accessed directly via `kubectl`:

```bash
# Backend logs
kubectl logs -n expensy -l app=expensy-backend --tail=100 -f

# Frontend logs
kubectl logs -n expensy -l app=expensy-frontend --tail=100 -f

# Mongo / Redis
kubectl logs -n expensy -l app=mongo --tail=100 -f
kubectl logs -n expensy -l app=redis --tail=100 -f
```

<img width="1911" height="1031" alt="Screenshot 2026-08-12 164430" src="https://github.com/user-attachments/assets/e841c254-2b63-4b40-84d7-21efb288b3b4" />


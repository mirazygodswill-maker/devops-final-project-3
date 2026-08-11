# Monitoring & Logging

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

**Monitoring stack pods**
<img width="1916" height="1057" alt="Screenshot" src="https://github.com/user-attachments/assets/df963a61-3543-4135-9bbb-fa43a9d4f2ec" />

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

/aws/eks/expensy-miracle-eks/cluster

Or via the AWS Console: **CloudWatch → Log groups → `/aws/eks/expensy-miracle-eks/cluster`**

**CloudWatch log group — control plane logs**
<!-- Add your CloudWatch console screenshot here -->

`controllerManager` and `scheduler` logs are currently disabled (not needed for this project's scope, but can be enabled the same way if deeper cluster-internals debugging is needed later).

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

**Application log output**
<img width="972" height="202" alt="Screenshot" src="https://github.com/user-attachments/assets/3f2e930c-950b-42c6-8ea2-d65d3615e9cf" />

For a more permanent/searchable solution beyond `kubectl logs` (which only holds recent logs and is lost if a pod is deleted), the natural next step would be shipping container stdout/stderr to CloudWatch Logs as well, via the **CloudWatch Container Insights** add-on, or a self-managed **ELK/EFK stack**. Not currently configured — flagged here as a known gap for anyone extending this project.
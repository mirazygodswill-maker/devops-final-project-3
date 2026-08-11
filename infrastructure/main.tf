terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

# ============================================================
# VARIABLES
# ============================================================

variable "project_name" {
  description = "Unique project name"
  type        = string
  default     = "expensy-miracle"
}

variable "cluster_name" {
  description = "EKS cluster name"
  type        = string
  default     = "expensy-miracle-eks"
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.20.0.0/16"
}

variable "node_instance_type" {
  description = "EKS worker node instance type"
  type        = string
  default     = "t3.medium"
}

variable "node_min_size" {
  description = "Minimum number of EKS nodes"
  type        = number
  default     = 2
}

variable "node_max_size" {
  description = "Maximum number of EKS nodes"
  type        = number
  default     = 3
}

variable "node_desired_size" {
  description = "Desired number of EKS nodes"
  type        = number
  default     = 2
}

# ============================================================
# AVAILABILITY ZONES
# ============================================================

data "aws_availability_zones" "available" {
  state = "available"
}

# ============================================================
# VPC
#
# Creates:
# - VPC
# - Internet Gateway
# - Public subnets
# - Private subnets
# - Route tables
# - NAT Gateway
# - Elastic IP for NAT Gateway
# ============================================================

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 6.0"

  name = "${var.project_name}-vpc"
  cidr = var.vpc_cidr

  azs = slice(data.aws_availability_zones.available.names, 0, 2)

  # Private subnets
  # EKS worker nodes will use these.
  private_subnets = [
    "10.20.1.0/24",
    "10.20.2.0/24"
  ]

  # Public subnets
  # These can be used by internet-facing load balancers.
  public_subnets = [
    "10.20.101.0/24",
    "10.20.102.0/24"
  ]

  # Internet Gateway
  create_igw = true

  # NAT Gateway
  enable_nat_gateway = true

  # One NAT Gateway to reduce project cost.
  # Production environments may use one per AZ.
  single_nat_gateway = true

  # Kubernetes public load balancer subnets
  public_subnet_tags = {
    "kubernetes.io/role/elb" = "1"
  }

  # Kubernetes internal load balancer subnets
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = "1"
  }

  tags = {
    Project     = var.project_name
    Environment = "dev"
    ManagedBy   = "Terraform"
  }
}

# ============================================================
# APPLICATION / LOAD BALANCER SECURITY GROUP
# ============================================================

resource "aws_security_group" "alb" {
  name        = "${var.project_name}-alb-sg"
  description = "Security group for Expensy application load balancer"
  vpc_id      = module.vpc.vpc_id

  tags = {
    Name        = "${var.project_name}-alb-sg"
    Project     = var.project_name
    Environment = "dev"
    ManagedBy   = "Terraform"
  }
}

# ============================================================
# HTTP INGRESS
# ============================================================

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id

  description = "Allow HTTP traffic"
  from_port   = 80
  to_port     = 80
  ip_protocol = "tcp"
  cidr_ipv4   = "0.0.0.0/0"
}

# ============================================================
# HTTPS INGRESS
# ============================================================

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id

  description = "Allow HTTPS traffic"
  from_port   = 443
  to_port     = 443
  ip_protocol = "tcp"
  cidr_ipv4   = "0.0.0.0/0"
}

# ============================================================
# OUTBOUND
# ============================================================

resource "aws_vpc_security_group_egress_rule" "alb_all_outbound" {
  security_group_id = aws_security_group.alb.id

  description = "Allow outbound traffic"
  ip_protocol = "-1"
  cidr_ipv4   = "0.0.0.0/0"
}

# ============================================================
# EKS CLUSTER
# ============================================================

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.0"

  name = var.cluster_name

  # Kubernetes version
  kubernetes_version = "1.33"

  # Allow kubectl access to the Kubernetes API.
  # This can later be restricted to your IP.
  endpoint_public_access = true

  # Give the IAM identity creating the cluster
  # administrator access to the EKS cluster.
  enable_cluster_creator_admin_permissions = true

  # ==========================================================
  # NETWORKING
  # ==========================================================

  vpc_id = module.vpc.vpc_id

  # EKS nodes are placed in private subnets.
  subnet_ids = module.vpc.private_subnets

  # ==========================================================
  # MANAGED NODE GROUP
  # ==========================================================

  eks_managed_node_groups = {
    default = {
      name = "${var.project_name}-nodes"

      instance_types = [
        var.node_instance_type
      ]

      min_size     = var.node_min_size
      max_size     = var.node_max_size
      desired_size = var.node_desired_size
    }
  }

  tags = {
    Project     = var.project_name
    Environment = "dev"
    ManagedBy   = "Terraform"
  }
}

# ============================================================
# OUTPUTS
# ============================================================

output "cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "cluster_endpoint" {
  description = "EKS Kubernetes API endpoint"
  value       = module.eks.cluster_endpoint
}

output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "private_subnets" {
  description = "Private subnet IDs"
  value       = module.vpc.private_subnets
}

output "public_subnets" {
  description = "Public subnet IDs"
  value       = module.vpc.public_subnets
}

output "alb_security_group_id" {
  description = "Application load balancer security group ID"
  value       = aws_security_group.alb.id
}

output "aws_region" {
  description = "AWS region"
  value       = "us-east-1"
}

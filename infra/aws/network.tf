# Networking. Use the account's default VPC and its public subnets so there's no
# NAT gateway to pay for. The box gets a public IP but is locked down by its
# security group; RDS isn't publicly reachable and only accepts traffic from the
# box's SG.

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# RDS needs a subnet group spanning at least two AZs.
resource "aws_db_subnet_group" "this" {
  name       = "${local.name_prefix}-db-subnet"
  subnet_ids = data.aws_subnets.default.ids

  tags = { Name = "${local.name_prefix}-db-subnet" }
}

# One subnet for the single instance.
data "aws_subnet" "app" {
  id = tolist(data.aws_subnets.default.ids)[0]
}

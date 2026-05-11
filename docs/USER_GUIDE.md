# VizCloud User Guide

## Welcome to VizCloud

VizCloud is a production-grade Electron application for managing Morpheus HVM (Hypervisor Virtual Machine) infrastructure across multiple datacenters.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard Overview](#dashboard-overview)
3. [Managing Hosts](#managing-hosts)
4. [Managing Virtual Machines](#managing-virtual-machines)
5. [Cluster Management](#cluster-management)
6. [Live Migration](#live-migration)
7. [System Diagnostics](#system-diagnostics)
8. [Storage Management](#storage-management)
9. [Topology View](#topology-view)
10. [Settings & Configuration](#settings--configuration)

---

## Getting Started

### Installation

1. **Download VizCloud** from the releases page
2. **Install** the application:
   - **macOS**: Open the `.dmg` file and drag VizCloud to Applications
   - **Windows**: Run the `.exe` installer
   - **Linux**: Install the `.AppImage` or `.deb` package

3. **Launch** VizCloud from your Applications folder

### First Launch

On first launch, VizCloud will:
1. Create a local database for host and VM information
2. Display the main dashboard
3. Wait for you to add your first host

---

## Dashboard Overview

The dashboard provides a real-time overview of your infrastructure:

### Key Metrics
- **Total Hosts**: Number of registered hypervisors
- **Total VMs**: Number of virtual machines across all hosts
- **Active Clusters**: Number of configured HA clusters
- **System Status**: Overall health indicator

### Recent Activity
- Latest migrations
- Host status changes
- VM state changes
- System alerts

### Quick Actions
- Add new host
- Create VM
- Start migration
- View diagnostics

---

## Managing Hosts

### Adding a Host

1. Navigate to **Hosts** from the sidebar
2. Click **Add Host** button
3. Enter host details:
   - **Hostname**: FQDN or hostname
   - **IP Address**: Management IP
   - **SSH User**: Username for SSH access
   - **SSH Password**: Password (encrypted locally)
   - **Datacenter**: Optional datacenter name
4. Click **Add**

VizCloud will:
- Connect to the host via SSH
- Discover system information
- Import existing VMs
- Begin monitoring

### Host Details

Click on any host to view:
- **System Information**: CPU, Memory, Storage
- **Performance Metrics**: Real-time resource usage
- **Virtual Machines**: VMs running on this host
- **Network Interfaces**: Network configuration
- **Status History**: Heartbeat and uptime logs

### Host Actions

Available actions for each host:
- **Edit**: Update host configuration
- **Refresh**: Force rescan of host
- **Maintenance Mode**: Temporarily disable for maintenance
- **Remove**: Unregister host from VizCloud

---

## Managing Virtual Machines

### VM List

The VMs page displays all virtual machines across your infrastructure:
- **Name**: VM hostname
- **Host**: Current hypervisor
- **State**: Running, Paused, Stopped, etc.
- **Resources**: CPU cores, Memory, Storage
- **Uptime**: Time since last boot

### VM Details

Click on any VM to view:
- **Configuration**: vCPUs, Memory, Disks, NICs
- **Performance**: CPU, Memory, Disk I/O, Network
- **Snapshots**: Available VM snapshots
- **Migration History**: Past migrations

### VM Actions

Available actions for each VM:
- **Start**: Boot the VM
- **Stop**: Graceful shutdown
- **Pause**: Suspend execution
- **Restart**: Reboot the VM
- **Migrate**: Move to another host
- **Clone**: Create a copy
- **Snapshot**: Take a snapshot
- **Delete**: Remove the VM

---

## Cluster Management

### Cluster Overview

VizCloud automatically detects Pacemaker/Corosync clusters and displays:
- **Cluster Name**: Cluster identifier
- **Member Hosts**: Nodes in the cluster
- **Quorum Status**: Current quorum state
- **Resource Groups**: Managed resources
- **Fence Status**: Fencing configuration

### Cluster Health

Monitor cluster health with:
- **Node Status**: Online/Offline state per node
- **Resource Status**: Running services
- **Quorum Votes**: Vote distribution
- **Fence Devices**: Configured fencing

### Cluster Actions

- **View Details**: Detailed cluster information
- **Add Node**: Add a new cluster member (via Pacemaker)
- **Remove Node**: Remove a cluster member
- **Fence Node**: Manually fence a node

---

## Live Migration

VizCloud supports both live and cold migration of VMs between hosts.

### Starting a Migration

1. Navigate to **Migration** page
2. Click **New Migration**
3. Configure migration:
   - **Virtual Machine**: Select VM to migrate
   - **Source Host**: Current host (auto-detected)
   - **Target Host**: Destination host
   - **Migration Type**:
     - **Live**: Zero-downtime migration (VM stays running)
     - **Cold**: VM is stopped, migrated, then started
4. Click **Start Migration**

### Migration Progress

During migration, VizCloud displays:
- **Progress**: Percentage complete
- **Data Transferred**: Bytes copied
- **Bandwidth**: Current transfer rate
- **Estimated Time**: Time remaining
- **State**: Preparing, Transferring, Finalizing

### Migration Actions

- **Cancel**: Abort the migration (VM returns to source)
- **View Logs**: Detailed migration logs
- **Retry**: Restart failed migration

### Migration Best Practices

- **Live Migration**: Use for production VMs that need zero downtime
- **Cold Migration**: Use for VMs that can tolerate brief downtime
- **Network**: Ensure fast network between source and target
- **Storage**: Verify sufficient storage on target host
- **Resources**: Confirm target host has adequate CPU/Memory

---

## System Diagnostics

The Diagnostics page provides troubleshooting tools:

### System Logs

View logs from:
- **VizCloud Application**: Client-side logs
- **Host Agents**: Remote host logs
- **Migration Logs**: Migration-specific logs
- **Error Logs**: Errors and warnings

### Performance Analysis

- **CPU Usage**: Per-host CPU utilization
- **Memory Usage**: Memory consumption trends
- **Disk I/O**: Storage performance
- **Network Traffic**: Bandwidth utilization

### Health Checks

Automated health checks:
- **SSH Connectivity**: Verify host access
- **Libvirt Status**: Check hypervisor health
- **Storage Availability**: Disk space checks
- **Network Connectivity**: Ping tests

### Troubleshooting Common Issues

**Host Unreachable**
- Verify network connectivity
- Check SSH credentials
- Confirm firewall rules

**VM Won't Start**
- Check resource availability
- Verify disk image exists
- Review VM configuration

**Migration Failed**
- Confirm network connectivity
- Check target host resources
- Review migration logs

---

## Storage Management

### Storage Overview

View storage across your infrastructure:
- **Total Storage**: Sum of all host storage
- **Used Storage**: Currently allocated space
- **Available Storage**: Free space
- **Storage Pools**: Configured storage pools

### Per-Host Storage

For each host, view:
- **Filesystem Usage**: Disk utilization
- **Storage Pools**: Libvirt storage pools
- **VM Disks**: Virtual disk images
- **Snapshots**: Snapshot storage usage

### Storage Actions

- **Create Pool**: Add new storage pool
- **Delete Pool**: Remove storage pool
- **Refresh**: Rescan storage
- **Cleanup**: Remove unused snapshots

---

## Topology View

The Topology page provides a visual network map of your infrastructure:

### Topology Features

- **Interactive Map**: Drag and zoom to explore
- **Host Nodes**: Visual representation of hypervisors
- **VM Nodes**: Virtual machines with status
- **Network Links**: Connections between hosts
- **Cluster Grouping**: Visual cluster boundaries
- **Real-time Status**: Live status indicators

### Topology Actions

- **Zoom**: Scroll to zoom in/out
- **Pan**: Drag to move around
- **Node Details**: Click node for details
- **Filter**: Show/hide specific node types
- **Export**: Save topology as image

---

## Settings & Configuration

### Application Settings

Configure VizCloud preferences:

**General**
- **Theme**: Dark (default) or Light
- **Language**: Select UI language
- **Auto-refresh**: Set refresh interval

**Connection**
- **SSH Timeout**: Connection timeout (seconds)
- **Retry Attempts**: Number of retries
- **Keep-alive**: SSH keep-alive interval

**Notifications**
- **Desktop Notifications**: Enable/disable
- **Sound Alerts**: Enable/disable
- **Email Alerts**: Configure email notifications

**Advanced**
- **Database Path**: Location of local database
- **Log Level**: Debug, Info, Warn, Error
- **Performance Mode**: Standard or High-performance

### Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Dashboard | `Cmd/Ctrl + 1` |
| Hosts | `Cmd/Ctrl + 2` |
| VMs | `Cmd/Ctrl + 3` |
| Clusters | `Cmd/Ctrl + 4` |
| Migration | `Cmd/Ctrl + 5` |
| Settings | `Cmd/Ctrl + ,` |
| Refresh | `Cmd/Ctrl + R` |
| Search | `Cmd/Ctrl + K` |

---

## Data Management

### Database Location

VizCloud stores data locally:
- **macOS**: `~/Library/Application Support/VizCloud/vizcloud.db`
- **Windows**: `%APPDATA%\VizCloud\vizcloud.db`
- **Linux**: `~/.config/VizCloud/vizcloud.db`

### Backup & Restore

**Manual Backup**:
1. Navigate to Settings → Advanced
2. Click **Export Database**
3. Save backup file

**Restore**:
1. Navigate to Settings → Advanced
2. Click **Import Database**
3. Select backup file

### Data Security

- **Encryption**: SSH passwords are encrypted using OS keychain
- **Local Storage**: All data stored locally (no cloud sync)
- **Permissions**: Database accessible only to user account

---

## Troubleshooting

### Common Issues

**Application Won't Start**
- Check logs: `~/Library/Logs/VizCloud/` (macOS)
- Verify database integrity
- Try reinstalling

**Can't Connect to Host**
- Verify SSH credentials
- Check firewall rules
- Test manual SSH connection

**Performance Issues**
- Close unused browser tabs
- Reduce refresh interval
- Enable performance mode

**Database Corruption**
- Restore from backup
- Run database integrity check
- Contact support

### Getting Help

- **Documentation**: `/docs` folder
- **Logs**: Application menu → View Logs
- **GitHub Issues**: Report bugs on GitHub
- **Email Support**: support@vizcloud.example.com

---

## Updates

VizCloud checks for updates automatically. To manually check:
1. Navigate to Settings
2. Click **Check for Updates**
3. Follow prompts to download and install

---

## Best Practices

### Infrastructure Management

- **Regular Backups**: Schedule VM snapshots
- **Monitoring**: Review diagnostics regularly
- **Maintenance Windows**: Use maintenance mode for updates
- **Capacity Planning**: Monitor resource usage trends

### Security

- **SSH Keys**: Use SSH keys instead of passwords
- **Firewall**: Configure firewall rules
- **Access Control**: Limit SSH access to management network
- **Updates**: Keep VizCloud and hosts updated

### Performance

- **Network**: Use dedicated network for migrations
- **Storage**: Use fast storage for VM disks
- **Resources**: Don't overcommit host resources
- **Clustering**: Use HA clusters for critical VMs

---

## Glossary

- **Host**: Physical server running hypervisor
- **VM**: Virtual Machine
- **Hypervisor**: Virtualization software (KVM/Libvirt)
- **Cluster**: Group of hosts providing HA
- **Migration**: Moving VM between hosts
- **Live Migration**: Migration with zero downtime
- **Cold Migration**: Migration with VM shutdown
- **Snapshot**: Point-in-time VM backup
- **Quorum**: Minimum votes for cluster operation
- **Fencing**: Forcibly stopping a node

---

*VizCloud v1.0.0-alpha.1*  
*Last updated: 2026-05-08*

#!/bin/bash
#Final HPE-VME log collection script version v5, released on 13th August 2025.

# Function to prompt user for input
prompt_user() {
    local prompt="$1"
    local choice
    while true; do
        echo "$prompt"
        read -rp "Enter your choice (1 or 2): " choice
        case $choice in
            1|2) echo "$choice"; break ;;
            *) echo "Invalid input. Please enter 1 or 2." ;;
        esac
    done
}

# Step 1: Check for existing log files
LOG_FILES=($(ls | grep -E 'collect_.*\.tar\.gz' 2>/dev/null))  # Find existing log files
LOG_COUNT=${#LOG_FILES[@]}  # Count the number of log files

if [ "$LOG_COUNT" -gt 0 ]; then
    echo "Found $LOG_COUNT existing log file(s):"
    for log in "${LOG_FILES[@]}"; do
        echo "  - $log"
    done

    if [ "$LOG_COUNT" -gt 1 ]; then
        echo
        echo "Observed multiple log files in this directory path. Do you need to remove them before proceeding?"
        echo "1. Yes, keep only one old log file and remove all others."
        echo "2. No, keep all log files and proceed to collect the latest output from the script."

        USER_CHOICE=$(prompt_user)
        if [ "$USER_CHOICE" -eq 1 ]; then
            echo "Keeping the latest log file and removing others..."
            # Extract timestamps from filenames, sort them, and find the latest one
            LATEST_LOG=$(echo "${LOG_FILES[@]}" | tr ' ' '\n' | sort -t'_' -k3,3 | tail -n 1)
            for log in "${LOG_FILES[@]}"; do
                if [ "$log" != "$LATEST_LOG" ]; then
             rm -f "$log"
                fi
            done
            echo "Old logs cleaned up. Retained: $LATEST_LOG"
        else
            echo "Retaining all existing log files and proceeding..."
        fi
    else
        echo "Only one log file exists. Proceeding without any cleanup."
    fi
else
    echo "No existing log files found. Proceeding with log collection."
fi

echo "Estimating size required for data collection..."

TOTAL_EST_SIZE_KB=0

# 1. Estimate size for /var/log (latest + one retention per log)
VAR_LOG_EST_KB=0
mkdir -p /tmp/vme_log_est_tmp

for logfile in $(ls /var/log | grep -E '^[a-zA-Z0-9_.-]+$' | sort -u); do
    base=$(echo "$logfile" | sed 's/\..*//')
    logs=($(ls -t /var/log/"$base"* 2>/dev/null | head -n 2))
    for f in "${logs[@]}"; do
        [ -f "$f" ] && cp -p "$f" /tmp/vme_log_est_tmp/ 2>/dev/null
    done
done

VAR_LOG_EST_KB=$(du -sk /tmp/vme_log_est_tmp | awk '{print $1}')
rm -rf /tmp/vme_log_est_tmp
echo "Estimated size for /var/log (latest + 1 retention): ${VAR_LOG_EST_KB} KB"
TOTAL_EST_SIZE_KB=$((TOTAL_EST_SIZE_KB + VAR_LOG_EST_KB))

# 2. Estimate for /etc/netplan
if [ -d /etc/netplan ]; then
    NETPLAN_KB=$(du -sk /etc/netplan | awk '{print $1}')
    echo "Estimated size for /etc/netplan: ${NETPLAN_KB} KB"
    TOTAL_EST_SIZE_KB=$((TOTAL_EST_SIZE_KB + NETPLAN_KB))
fi

# 3. Estimate for /etc/morpheus
if [ -d /etc/morpheus ]; then
    MORPHEUS_ETC_KB=$(du -sk /etc/morpheus | awk '{print $1}')
    echo "Estimated size for /etc/morpheus: ${MORPHEUS_ETC_KB} KB"
    TOTAL_EST_SIZE_KB=$((TOTAL_EST_SIZE_KB + MORPHEUS_ETC_KB))
fi

# 4. Estimate for /var/log/morpheus
if [ -d /var/log/morpheus ]; then
    MORPHEUS_LOG_KB=$(du -sk /var/log/morpheus | awk '{print $1}')
    echo "Estimated size for /var/log/morpheus: ${MORPHEUS_LOG_KB} KB"
    TOTAL_EST_SIZE_KB=$((TOTAL_EST_SIZE_KB + MORPHEUS_LOG_KB))
fi

# 5. Add estimate for sos report (~250MB default)
SOS_EST_KB=256000
echo "Estimated space for sosreport: ${SOS_EST_KB} KB"
TOTAL_EST_SIZE_KB=$((TOTAL_EST_SIZE_KB + SOS_EST_KB))

# Display total
echo "-----------------------------------------------"
echo "Total estimated space needed: ${TOTAL_EST_SIZE_KB} KB"
echo "-----------------------------------------------"


# Check available space in current filesystem
SCRIPT_DIR=$(dirname "$(readlink -f "$0")")
FS_AVAIL_KB=$(df -Pk "$SCRIPT_DIR" | awk 'NR==2 {print $4}')
echo "Available space in $(df -h "$SCRIPT_DIR" | awk 'NR==2 {print $6}') is ${FS_AVAIL_KB} KB"

if [ "$FS_AVAIL_KB" -lt "$TOTAL_EST_SIZE_KB" ]; then
    echo "Warning: Estimated required space exceeds available space."
    echo "Please run the script from a filesystem with more free space."
    exit 1
else
    echo "Sufficient space available to proceed with log collection."
fi

# Step 2: Proceed with the rest of the script
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
HOSTNAME=$(hostname)
OUTPUT_DIR="$(pwd)/collect_${HOSTNAME}_${TIMESTAMP}"
mkdir -p "$OUTPUT_DIR"

echo "Collection starting at $OUTPUT_DIR"

run_command() {
    local description="$1"
    local outfile="$2"
    shift 2
    local command=("$@")

    {
        echo "===== $description ====="
        echo "Command: ${command[*]}"
        "${command[@]}"
        echo ""
    } >> "$outfile" 2>&1
}

# Collect model, OS version, and kernel version
echo "Collecting model, OS version, and kernel version..."
MODEL=$(cat /sys/devices/virtual/dmi/id/product_name 2>/dev/null || echo "Model information not available")
OS_VERSION=$(lsb_release -d | awk -F'\t' '{print $2}')
KERNEL_VERSION=$(uname -r)

echo "Model: $MODEL" > "$OUTPUT_DIR/system_info.txt"
echo "OS Version: $OS_VERSION" >> "$OUTPUT_DIR/system_info.txt"
echo "Kernel Version: $KERNEL_VERSION" >> "$OUTPUT_DIR/system_info.txt"
run_command "Hostnamectl Output" "$OUTPUT_DIR/hostnamectl" hostnamectl
run_command "Dmesg  Output" "$OUTPUT_DIR/Dmesg" dmesg -T

# 1. Check if Appliance
if command -v morpheus-ctl &>/dev/null; then
    echo "Detected: HPE-VME Appliance Node"
    NODE_TYPE="Appliance"

    # Check service states
    SERVICE_STATUS=$(morpheus-ctl status)
    echo "$SERVICE_STATUS" > "$OUTPUT_DIR/morpheus_service_status.txt"

    # Extract down services
     DOWN_SERVICES=$(echo "$SERVICE_STATUS" | awk '$1=="down:"{svc=$2; sub(/:$/,"",svc); print svc}')

    if [ -z "$DOWN_SERVICES" ]; then
        echo "All morpheus appliance services are successfully running."
    else
        echo "Alert!!!The following morpheus appliance services are in down state:"
        echo "$DOWN_SERVICES"
        echo "Please try to start the above down services manually."
        echo "NOTE:If they fail to start, contact the HPE support center for further assistance."
        echo "Proceeding with Appliance data collection..."
    fi

elif command -v morpheus-node-ctl &>/dev/null; then
    echo "Detected: HPE-VME KVM Node"
    NODE_TYPE="KVM"
else
    echo "Morpheus Agent is not installed. Suggestion is to confirm the Morpheus Agent installation."
    echo "Proceeding with HPE-VME KVM node log collection..."
    NODE_TYPE="KVM"
fi

# 2. Common - Always collect SOS report
echo "Collecting SOS report..."
sos report --batch --tmp-dir "$OUTPUT_DIR" > "$OUTPUT_DIR/sosreport_info.txt" 2>&1

# Appliance-specific data
if [ "$NODE_TYPE" == "Appliance" ]; then
    echo "Collecting Appliance data..."
    morpheus-ctl status > "$OUTPUT_DIR/morpheus_service_status.txt"
    cp /etc/morpheus/morpheus.rb "$OUTPUT_DIR/morpheus_appliance_configuration.txt" 2>/dev/null
    cp -r /var/log/morpheus "$OUTPUT_DIR/morpheus_logs" 2>/dev/null
    cp -r /etc/morpheus "$OUTPUT_DIR/morpheus_config" 2>/dev/null
    cp -r /etc/netplan "$OUTPUT_DIR/network_config" 2>/dev/null

else
    echo "Collecting KVM Node data..."
    morpheus-node-ctl status > "$OUTPUT_DIR/morpheus_node_service_status.txt"

    mkdir -p "$OUTPUT_DIR/var_logs"
    ls -l /var/log > "$OUTPUT_DIR/var_logs/log_listing.txt"
    for logfile in $(ls /var/log | grep -E '^[a-zA-Z0-9_.-]+$' | sort -u); do
        base=$(echo "$logfile" | sed 's/\..*//')
        logs=($(ls -t /var/log/"$base"* 2>/dev/null | head -n 2))
        for f in "${logs[@]}"; do
            cp -p "$f" "$OUTPUT_DIR/var_logs/" 2>/dev/null

        done
    done

# Add new log collection for KVM hosts
        if [ "$NODE_TYPE" == "KVM" ]; then
            mkdir -p "$OUTPUT_DIR/morpheus-node-log"
            cp -pr /var/log/morpheus-node/morphd "$OUTPUT_DIR/morpheus-node-log/" 2>/dev/null

            mkdir -p "$OUTPUT_DIR/pacemaker-log"
            cp -r /var/log/pacemaker "$OUTPUT_DIR/pacemaker-log/" 2>/dev/null

            mkdir -p "$OUTPUT_DIR/pcsd-log"
            cp -r /var/log/pcsd "$OUTPUT_DIR/pcsd-log/" 2>/dev/null
        fi

    mkdir -p "$OUTPUT_DIR/virsh_commands"
    run_command "Virsh Version" "$OUTPUT_DIR/virsh_commands/node_info.txt" virsh version --daemon
    run_command "Virsh Hostname" "$OUTPUT_DIR/virsh_commands/node_info.txt" virsh hostname
    run_command "Virsh Node Info" "$OUTPUT_DIR/virsh_commands/node_info.txt" virsh nodeinfo
    run_command "Virsh Freecell" "$OUTPUT_DIR/virsh_commands/node_info.txt" virsh freecell --all
    run_command "Virsh Node CPU Stats" "$OUTPUT_DIR/virsh_commands/node_info.txt" virsh nodecpustats
    run_command "Virsh List All" "$OUTPUT_DIR/virsh_commands/node_info.txt" virsh list --all
    run_command "Virsh Net List All" "$OUTPUT_DIR/virsh_commands/node_info.txt" virsh net-list --all
    run_command "Virsh Storage Pool List All" "$OUTPUT_DIR/virsh_commands/node_info.txt" virsh pool-list --all --details
    run_command "Virsh Capabilities" "$OUTPUT_DIR/virsh_commands/node_info.txt" virsh capabilities

    for net in $(virsh net-list --all --name); do
        run_command "Virsh Net Info for $net" "$OUTPUT_DIR/virsh_commands/node_info.txt" virsh net-info "$net"
    done

    for pool in $(virsh pool-list --name); do
        run_command "Virsh Vol List for $pool" "$OUTPUT_DIR/virsh_commands/node_info.txt" virsh vol-list --details "$pool"
    done

    for vm in $(virsh list --all --name); do
        [ -z "$vm" ] && continue
        mkdir -p "$OUTPUT_DIR/virsh_commands/$vm"
        run_command "Dump XML for $vm" "$OUTPUT_DIR/virsh_commands/$vm/dumpxml.txt" virsh dumpxml "$vm"
        run_command "vCPU Info for $vm" "$OUTPUT_DIR/virsh_commands/$vm/vcpuinfo.txt" virsh vcpuinfo "$vm"
        run_command "Memory Stats for $vm" "$OUTPUT_DIR/virsh_commands/$vm/dommemstat.txt" virsh dommemstat "$vm"
        run_command "Block List for $vm" "$OUTPUT_DIR/virsh_commands/$vm/domblklist.txt" virsh domblklist "$vm"
        run_command "Block Error for $vm" "$OUTPUT_DIR/virsh_commands/$vm/domblkerror.txt" virsh domblkerror "$vm"
        run_command "virtual interfaces for $vm" "$OUTPUT_DIR/virsh_commands/$vm/domiflist.txt" virsh domiflist "$vm"

    DISKS=$(virsh domblklist "$vm" | awk '/^vda|^sda|^vd[b-z]|^sd[b-z]/ {print $1}')
    for disk in $DISKS; do
    run_command "Block Info for $vm device $disk" "$OUTPUT_DIR/virsh_commands/$vm/domblkinfo_${disk}.txt" virsh domblkinfo "$vm" "$disk"
    done

    MACS=$(virsh domiflist "$vm" | awk 'NF > 0 && $1 != "Interface" && $1 !~ /^-+$/ {print $5}')
    for MAC in $MACS; do
    echo "===== Interface Link State for $vm ($MAC) =====" >> "$OUTPUT_DIR/virsh_commands/$vm/domif-getlink.txt"
    virsh domif-getlink "$vm" "$MAC" >> "$OUTPUT_DIR/virsh_commands/$vm/domif-getlink.txt" 2>&1
    echo "----------------------------------------" >> "$OUTPUT_DIR/virsh_commands/$vm/domif-getlink.txt"
    done

    INTERFACES=$(virsh domiflist "$vm" | awk 'NF > 0 && $1 != "Interface" && $1 !~ /^-+$/ {print $5}')
    for INTERFACE in $INTERFACES; do
    virsh domifstat "$vm" "$INTERFACE" > "$OUTPUT_DIR/virsh_commands/$vm/domifstat.txt"
    done

    done

    echo "Collecting Ceph commands output..."
    mkdir -p "$OUTPUT_DIR/ceph_info"
    run_command "Ceph Status" "$OUTPUT_DIR/ceph_info/ceph.txt" ceph status
    run_command "Ceph DF" "$OUTPUT_DIR/ceph_info/ceph.txt" ceph df
    run_command "Ceph DF Detail" "$OUTPUT_DIR/ceph_info/ceph.txt" ceph df detail
    run_command "Ceph LVM List" "$OUTPUT_DIR/ceph_info/ceph.txt" ceph-volume lvm list
    run_command "Ceph OSD Pool List" "$OUTPUT_DIR/ceph_info/ceph.txt" ceph osd pool ls
    run_command "Ceph OSD Status" "$OUTPUT_DIR/ceph_info/ceph.txt" ceph osd status

    echo "Collecting Open vSwitch information..."

    mkdir -p "$OUTPUT_DIR/ovs_info"
    run_command "OVS Version" "$OUTPUT_DIR/ovs_info/ovs.txt" ovs-vsctl -V
    run_command "OVS Show" "$OUTPUT_DIR/ovs_info/ovs.txt" ovs-vsctl show
    run_command "OVS Bridges" "$OUTPUT_DIR/ovs_info/ovs.txt" ovs-vsctl list-br

    for br in $(ovs-vsctl list-br); do
        run_command "OVS Ports $br" "$OUTPUT_DIR/ovs_info/ovs.txt" ovs-vsctl list-ports "$br"
        run_command "OVS Flows $br" "$OUTPUT_DIR/ovs_info/ovs.txt" ovs-ofctl show "$br"
    done

    run_command "OVS Switchd Status" "$OUTPUT_DIR/ovs_info/ovs.txt" systemctl status ovs-vswitchd.service
    run_command "OVS DB Status" "$OUTPUT_DIR/ovs_info/ovs.txt" systemctl status ovsdb-server.service

    echo "Collecting Cluster information..."

    mkdir -p "$OUTPUT_DIR/cluster_info"
    run_command "PCS Status" "$OUTPUT_DIR/cluster_info/pcs.txt" pcs cluster status
    run_command "PCS Resource" "$OUTPUT_DIR/cluster_info/pcs.txt" pcs resource
    run_command "PCS Config" "$OUTPUT_DIR/cluster_info/pcs.txt" pcs config
    run_command "PCS Resource Config" "$OUTPUT_DIR/cluster_info/pcs.txt" pcs resource config
    run_command "PCS Stonith Config" "$OUTPUT_DIR/cluster_info/pcs.txt" pcs stonith config
    run_command "STONITH Status" "$OUTPUT_DIR/cluster_info/pcs.txt" pcs stonith status
    run_command "CRM Cluster" "$OUTPUT_DIR/cluster_info/pcs.txt" crm cluster status
    run_command "CRM Config Show" "$OUTPUT_DIR/cluster_info/pcs.txt" crm configure show

    echo "Collecting Network configuration files..."
    mkdir -p "$OUTPUT_DIR/network_config"
    cp -r /etc/netplan/* "$OUTPUT_DIR/network_config/" 2>/dev/null
fi

cd "$(dirname "$OUTPUT_DIR")"
tar czf "$(basename "$OUTPUT_DIR").tar.gz" "$(basename "$OUTPUT_DIR")"
rm -rf "$OUTPUT_DIR"
echo "Output archive created: $(basename "$OUTPUT_DIR").tar.gz"

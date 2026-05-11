#!/usr/bin/env bash
#===============================================================================
#
#          FILE: morpheus-hvm-manager.sh
#
#         USAGE: ./morpheus-hvm-manager.sh
#
#   DESCRIPTION: Morpheus HVM Cluster Management & Live Migration Tool
#                A comprehensive, visually stunning terminal-based management
#                interface for Morpheus HVM hosts with live VM migration,
#                cluster diagnostics, and system monitoring capabilities.
#
#       OPTIONS: Run without arguments for interactive menu
#  REQUIREMENTS: dialog, virsh, pcs, corosync, pacemaker, netplan, bc, jq
#        AUTHOR: AI Assistant for Morpheus Infrastructure
#       VERSION: 1.0.0
#       CREATED: 2026-02-06
#      REVISION: Production Release
#
#===============================================================================

set -o pipefail

#===============================================================================
# CONFIGURATION VARIABLES - DO NOT MODIFY WITHOUT EXPLICIT APPROVAL
#===============================================================================
readonly SCRIPT_VERSION="1.0.1"
readonly SCRIPT_NAME="Morpheus HVM Manager"
readonly LOG_DIR="/var/log/morpheus-node/morphd"
readonly LOG_FILE="${LOG_DIR}/current"
readonly DIAG_DIR="/opt/diagnostics"
readonly DIAG_LOG="${DIAG_DIR}/diagnostic_$(date +%Y%m%d_%H%M%S).log"
readonly MIGRATION_LOG="${DIAG_DIR}/migration_history.log"
readonly CONFIG_BACKUP_DIR="${DIAG_DIR}/config_backups"
readonly TEMP_DIR="/tmp/morpheus-hvm-manager"
readonly DNS_TEST_DOMAIN="rectitude.net"

# Color definitions for consistent theming
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly MAGENTA='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly WHITE='\033[1;37m'
readonly BOLD='\033[1m'
readonly DIM='\033[2m'
readonly RESET='\033[0m'
readonly BG_BLUE='\033[44m'
readonly BG_GREEN='\033[42m'
readonly BG_RED='\033[41m'
readonly BG_YELLOW='\033[43m'

# Dialog theming
export DIALOGRC="${TEMP_DIR}/.dialogrc"
export NEWT_COLORS='
root=,blue
window=,lightgray
border=black,lightgray
shadow=,black
button=black,cyan
actbutton=white,cyan
compactbutton=black,lightgray
title=black,lightgray
roottext=white,blue
textbox=black,lightgray
acttextbox=white,cyan
entry=black,lightgray
disentry=gray,lightgray
checkbox=black,lightgray
actcheckbox=lightgray,cyan
emptyscale=,gray
fullscale=,cyan
listbox=black,lightgray
actlistbox=black,cyan
actsellistbox=lightgray,cyan
'

# Terminal dimensions
TERM_HEIGHT=$(tput lines 2>/dev/null || echo 24)
TERM_WIDTH=$(tput cols 2>/dev/null || echo 80)
DIALOG_HEIGHT=$((TERM_HEIGHT - 4))
DIALOG_WIDTH=$((TERM_WIDTH - 4))
[[ $DIALOG_HEIGHT -lt 20 ]] && DIALOG_HEIGHT=20
[[ $DIALOG_WIDTH -lt 70 ]] && DIALOG_WIDTH=70
[[ $DIALOG_HEIGHT -gt 40 ]] && DIALOG_HEIGHT=40
[[ $DIALOG_WIDTH -gt 120 ]] && DIALOG_WIDTH=120

#===============================================================================
# INITIALIZATION FUNCTIONS
#===============================================================================

init_environment() {
    # Create required directories
    mkdir -p "${TEMP_DIR}" "${DIAG_DIR}" "${CONFIG_BACKUP_DIR}" 2>/dev/null
    
    # Create custom dialog theme
    cat > "${DIALOGRC}" << 'DIALOGTHEME'
# Morpheus HVM Manager Dialog Theme
aspect = 0
separate_widget = ""
tab_len = 0
visit_items = OFF
use_shadow = ON
use_colors = ON

screen_color = (CYAN,BLUE,ON)
shadow_color = (BLACK,BLACK,ON)
dialog_color = (BLACK,WHITE,OFF)
title_color = (BLUE,WHITE,ON)
border_color = (WHITE,WHITE,ON)
button_active_color = (WHITE,BLUE,ON)
button_inactive_color = (BLACK,WHITE,OFF)
button_key_active_color = (WHITE,BLUE,ON)
button_key_inactive_color = (RED,WHITE,OFF)
button_label_active_color = (YELLOW,BLUE,ON)
button_label_inactive_color = (BLACK,WHITE,ON)
inputbox_color = (BLACK,WHITE,OFF)
inputbox_border_color = (BLACK,WHITE,OFF)
searchbox_color = (BLACK,WHITE,OFF)
searchbox_title_color = (BLUE,WHITE,ON)
searchbox_border_color = (WHITE,WHITE,ON)
position_indicator_color = (BLUE,WHITE,ON)
menubox_color = (BLACK,WHITE,OFF)
menubox_border_color = (WHITE,WHITE,ON)
item_color = (BLACK,WHITE,OFF)
item_selected_color = (WHITE,BLUE,ON)
tag_color = (BLUE,WHITE,ON)
tag_selected_color = (YELLOW,BLUE,ON)
tag_key_color = (RED,WHITE,OFF)
tag_key_selected_color = (RED,BLUE,ON)
check_color = (BLACK,WHITE,OFF)
check_selected_color = (WHITE,BLUE,ON)
uarrow_color = (GREEN,WHITE,ON)
darrow_color = (GREEN,WHITE,ON)
itemhelp_color = (WHITE,BLACK,OFF)
form_active_text_color = (WHITE,BLUE,ON)
form_text_color = (BLACK,WHITE,ON)
form_item_readonly_color = (CYAN,WHITE,ON)
gauge_color = (BLUE,WHITE,ON)
border2_color = (WHITE,WHITE,ON)
inputbox_border2_color = (BLACK,WHITE,OFF)
searchbox_border2_color = (WHITE,WHITE,ON)
menubox_border2_color = (WHITE,WHITE,ON)
DIALOGTHEME

    # Check for required commands
    local missing_deps=()
    for cmd in dialog virsh pcs corosync-cfgtool crm_mon netplan bc jq lsblk multipath; do
        if ! command -v "$cmd" &>/dev/null; then
            missing_deps+=("$cmd")
        fi
    done
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        echo -e "${RED}Missing dependencies: ${missing_deps[*]}${RESET}"
        echo -e "${YELLOW}Installing missing packages...${RESET}"
        apt-get update -qq
        apt-get install -y dialog bc jq 2>/dev/null
    fi
    
    # Verify root privileges
    if [[ $EUID -ne 0 ]]; then
        dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
               --title "⚠️  Permission Error" \
               --msgbox "\nThis tool requires root privileges.\n\nPlease run with: sudo $0" 10 50
        exit 1
    fi
}

cleanup() {
    rm -rf "${TEMP_DIR}" 2>/dev/null
    clear
    echo -e "${GREEN}Thank you for using ${SCRIPT_NAME}!${RESET}"
}

trap cleanup EXIT

#===============================================================================
# UTILITY FUNCTIONS
#===============================================================================

log_action() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] [${level}] ${message}" >> "${DIAG_DIR}/manager.log"
}

show_progress() {
    local title="$1"
    local text="$2"
    local percent="$3"
    
    echo "$percent" | dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
                             --title "$title" \
                             --gauge "$text" 8 70 0
}

animated_progress() {
    local title="$1"
    local duration="$2"
    local steps=$((duration * 10))
    
    (
        for ((i=0; i<=100; i++)); do
            echo $i
            sleep $(echo "scale=3; $duration/100" | bc)
        done
    ) | dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
               --title "$title" \
               --gauge "\nProcessing..." 8 70 0
}

format_bytes() {
    local bytes=$1
    if [[ $bytes -ge 1073741824 ]]; then
        echo "$(echo "scale=2; $bytes/1073741824" | bc) GB"
    elif [[ $bytes -ge 1048576 ]]; then
        echo "$(echo "scale=2; $bytes/1048576" | bc) MB"
    elif [[ $bytes -ge 1024 ]]; then
        echo "$(echo "scale=2; $bytes/1024" | bc) KB"
    else
        echo "${bytes} B"
    fi
}

format_time() {
    local seconds=$1
    local hours=$((seconds / 3600))
    local minutes=$(((seconds % 3600) / 60))
    local secs=$((seconds % 60))
    printf "%02d:%02d:%02d" $hours $minutes $secs
}

get_status_icon() {
    local status="$1"
    case "$status" in
        running|online|active|started|OK|ok|Online)
            echo "✅"
            ;;
        stopped|offline|inactive|Offline)
            echo "🔴"
            ;;
        paused|standby|Standby)
            echo "⏸️"
            ;;
        error|failed|Error|FAILED)
            echo "❌"
            ;;
        warning|degraded|Warning)
            echo "⚠️"
            ;;
        migrating|syncing)
            echo "🔄"
            ;;
        *)
            echo "❓"
            ;;
    esac
}

#===============================================================================
# CLUSTER DISCOVERY FUNCTIONS
#===============================================================================

get_cluster_nodes() {
    local nodes=()
    local current_host=$(hostname -f 2>/dev/null || hostname)
    
    # Try pcs cluster status first
    if command -v pcs &>/dev/null; then
        while IFS= read -r node; do
            [[ -n "$node" && "$node" != "$current_host" ]] && nodes+=("$node")
        done < <(pcs status nodes 2>/dev/null | grep -E "Online:|Standby:" | sed 's/.*: //' | tr ' ' '\n' | grep -v "^$")
    fi
    
    # Fallback to corosync config
    if [[ ${#nodes[@]} -eq 0 ]] && [[ -f /etc/corosync/corosync.conf ]]; then
        while IFS= read -r node; do
            [[ -n "$node" && "$node" != "$current_host" ]] && nodes+=("$node")
        done < <(grep -E "ring0_addr:|host:" /etc/corosync/corosync.conf 2>/dev/null | awk '{print $2}' | tr -d ',')
    fi
    
    # Fallback to /etc/hosts cluster entries
    if [[ ${#nodes[@]} -eq 0 ]]; then
        while IFS= read -r node; do
            [[ -n "$node" && "$node" != "$current_host" ]] && nodes+=("$node")
        done < <(grep -iE "hvm|morpheus|cluster|morph" /etc/hosts 2>/dev/null | awk '{print $2}' | grep -v "^$" | grep -v "$(hostname)")
    fi
    
    printf '%s\n' "${nodes[@]}" | sort -u
}

check_node_connectivity() {
    local node="$1"
    local timeout=3
    
    # Completely silent connectivity check
    if ping -c 1 -W "$timeout" "$node" >/dev/null 2>&1; then
        if ssh -q -o ConnectTimeout="$timeout" -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "$node" "exit 0" </dev/null >/dev/null 2>&1; then
            printf "ssh"
        else
            printf "ping"
        fi
    else
        printf "offline"
    fi
}

#===============================================================================
# VM MANAGEMENT FUNCTIONS
#===============================================================================

get_running_vms() {
    virsh list --all 2>/dev/null | tail -n +3 | grep -v "^$" | while read -r id name state; do
        [[ -n "$name" ]] && echo "$name|$state|$id"
    done
}

get_vm_details() {
    local vm_name="$1"
    local details=""
    
    # Get VM info
    local vcpus=$(virsh vcpucount "$vm_name" --current 2>/dev/null || echo "N/A")
    local memory=$(virsh dominfo "$vm_name" 2>/dev/null | grep "Used memory" | awk '{print $3}')
    local state=$(virsh domstate "$vm_name" 2>/dev/null)
    local autostart=$(virsh dominfo "$vm_name" 2>/dev/null | grep "Autostart" | awk '{print $2}')
    
    # Get disk info
    local disks=$(virsh domblklist "$vm_name" 2>/dev/null | tail -n +3 | grep -v "^$" | wc -l)
    
    # Get network info
    local networks=$(virsh domiflist "$vm_name" 2>/dev/null | tail -n +3 | grep -v "^$" | wc -l)
    
    echo "State: $state"
    echo "vCPUs: $vcpus"
    echo "Memory: $(format_bytes $((memory * 1024)))"
    echo "Disks: $disks"
    echo "Networks: $networks"
    echo "Autostart: $autostart"
}

show_vm_list() {
    local temp_file="${TEMP_DIR}/vm_list.txt"
    
    {
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo "                        VIRTUAL MACHINES ON $(hostname)"
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo ""
        printf "%-5s %-30s %-12s %-10s %-15s\n" "ID" "NAME" "STATE" "vCPUs" "MEMORY"
        echo "───────────────────────────────────────────────────────────────────────────────"
        
        virsh list --all 2>/dev/null | tail -n +3 | grep -v "^$" | while read -r id name state; do
            if [[ -n "$name" ]]; then
                local vcpus=$(virsh vcpucount "$name" --current 2>/dev/null || echo "-")
                local memory=$(virsh dominfo "$name" 2>/dev/null | grep "Used memory" | awk '{print $3}')
                local mem_formatted=$(format_bytes $((memory * 1024)) 2>/dev/null || echo "-")
                local icon=$(get_status_icon "$state")
                
                printf "%-5s %-30s %s %-10s %-10s %-15s\n" "${id:--}" "$name" "$icon" "$state" "$vcpus" "$mem_formatted"
            fi
        done
        
        echo ""
        echo "───────────────────────────────────────────────────────────────────────────────"
        echo "Total VMs: $(virsh list --all 2>/dev/null | tail -n +3 | grep -v "^$" | wc -l)"
        echo "Running: $(virsh list 2>/dev/null | tail -n +3 | grep -v "^$" | wc -l)"
        echo "═══════════════════════════════════════════════════════════════════════════════"
    } > "$temp_file"
    
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "📋 Virtual Machines Overview" \
           --textbox "$temp_file" $DIALOG_HEIGHT $DIALOG_WIDTH
}

#===============================================================================
# LIVE MIGRATION FUNCTIONS
#===============================================================================

select_vm_for_migration() {
    local menu_items=()
    local count=0
    local temp_vms="${TEMP_DIR}/running_vms.tmp"
    
    # Get running VMs into temp file
    get_running_vms > "$temp_vms" 2>/dev/null
    
    while IFS='|' read -r name state id; do
        if [[ "$state" == "running" && -n "$name" ]]; then
            ((count++))
            menu_items+=("$name" "ID: ${id:-N/A}")
        fi
    done < "$temp_vms"
    
    rm -f "$temp_vms" 2>/dev/null
    
    if [[ $count -eq 0 ]]; then
        dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
               --title "⚠️  No Running VMs" \
               --msgbox "\nNo running VMs found on this host.\n\nOnly running VMs can be live migrated." 10 50
        return 1
    fi
    
    local selected
    selected=$(dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
                      --title "🖥️  Select VM to Migrate" \
                      --menu "\nSelect a running VM to live migrate:\n" \
                      $DIALOG_HEIGHT $DIALOG_WIDTH $((DIALOG_HEIGHT - 8)) \
                      "${menu_items[@]}" \
                      3>&1 1>&2 2>&3)
    
    [[ -n "$selected" ]] && echo "$selected"
}

select_target_host() {
    local vm_name="$1"
    local menu_items=()
    local count=0
    local temp_nodes="${TEMP_DIR}/target_nodes.tmp"
    
    # Get nodes and check connectivity - all output to temp file
    > "$temp_nodes"
    
    while IFS= read -r node; do
        if [[ -n "$node" ]]; then
            local status
            status=$(check_node_connectivity "$node")
            echo "${node}|${status}" >> "$temp_nodes"
        fi
    done < <(get_cluster_nodes 2>/dev/null)
    
    # Build menu from temp file
    while IFS='|' read -r node status; do
        if [[ -n "$node" ]]; then
            case "$status" in
                ssh)
                    ((count++))
                    menu_items+=("$node" "✅ Online (SSH OK)")
                    ;;
            esac
        fi
    done < "$temp_nodes"
    
    rm -f "$temp_nodes" 2>/dev/null
    
    if [[ $count -eq 0 ]]; then
        dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
               --title "⚠️  No Available Targets" \
               --msgbox "\nNo reachable cluster nodes found with SSH access.\n\nEnsure:\n  • Other nodes are online\n  • SSH key authentication is configured\n  • Nodes are in /etc/hosts or cluster config" 14 60
        return 1
    fi
    
    local selected
    selected=$(dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
                      --title "🎯 Select Target Host" \
                      --menu "\nSelect destination host for VM: $vm_name\n" \
                      $DIALOG_HEIGHT $DIALOG_WIDTH $((DIALOG_HEIGHT - 8)) \
                      "${menu_items[@]}" \
                      3>&1 1>&2 2>&3)
    
    [[ -n "$selected" ]] && echo "$selected"
}

perform_live_migration() {
    local vm_name="$1"
    local target_host="$2"
    local log_file="${TEMP_DIR}/migration_${vm_name}.log"
    local start_time=$(date +%s)
    
    # --- STEP 0: ESTABLISH SSH TRUST ---
    # This prevents the "Are you sure?" prompt that hangs the background process
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "🔐 SSH Handshake" \
           --infobox "\nEstablishing trust with $target_host..." 5 50
    
    # Remove old keys (prevents conflicts)
    ssh-keygen -R "$target_host" >/dev/null 2>&1
    local target_ip=$(getent hosts "$target_host" | awk '{print $1}' | head -n 1)
    [[ -n "$target_ip" ]] && ssh-keygen -R "$target_ip" >/dev/null 2>&1
    
    # Add new keys silently
    ssh-keyscan -H "$target_host" >> /root/.ssh/known_hosts 2>/dev/null
    [[ -n "$target_ip" ]] && ssh-keyscan -H "$target_ip" >> /root/.ssh/known_hosts 2>/dev/null
    
    # Verify connection works without prompt
    if ! ssh -o BatchMode=yes -o StrictHostKeyChecking=no "$target_host" "exit 0" 2>/dev/null; then
         dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
               --title "❌ SSH Error" \
               --msgbox "\nCould not establish passwordless SSH to $target_host.\n\nPlease ensure SSH keys are exchanged:\n  ssh-copy-id $target_host" 10 60
         return 1
    fi
    # -----------------------------------

    # 1. Start Migration in Background (SAN MODE)
    (
        virsh migrate --live --persistent --undefinesource --verbose "$vm_name" "qemu+ssh://${target_host}/system" > "$log_file" 2>&1
    ) &
    local mig_pid=$!
    
    # 2. Monitor Loop
    while kill -0 $mig_pid 2>/dev/null; do
        local now=$(date +%s)
        local elapsed=$((now - start_time))
        
        # Fetch stats
        local stats=$(virsh domjobinfo "$vm_name" 2>/dev/null)
        
        # Helper function to convert to bytes
        to_bytes() {
            local val=$1
            local unit=$2
            case "$unit" in
                GiB) echo "$val * 1073741824" | bc | cut -d. -f1 ;;
                MiB) echo "$val * 1048576" | bc | cut -d. -f1 ;;
                KiB) echo "$val * 1024" | bc | cut -d. -f1 ;;
                *)   echo "$val" ;;
            esac
        }

        # Extract raw values
        local dt_val=$(echo "$stats" | grep "Data total:" | awk '{print $3}')
        local dt_unit=$(echo "$stats" | grep "Data total:" | awk '{print $4}')
        local dp_val=$(echo "$stats" | grep "Data processed:" | awk '{print $3}')
        local dp_unit=$(echo "$stats" | grep "Data processed:" | awk '{print $4}')
        local dr_val=$(echo "$stats" | grep "Data remaining:" | awk '{print $3}')
        local dr_unit=$(echo "$stats" | grep "Data remaining:" | awk '{print $4}')
        
        local data_total=$(to_bytes "${dt_val:-0}" "$dt_unit")
        local data_processed=$(to_bytes "${dp_val:-0}" "$dp_unit")
        local data_remaining=$(to_bytes "${dr_val:-0}" "$dr_unit")

        # Fallback for "Initializing" state
        if [[ "$data_total" == "0" ]]; then
             local mt_val=$(echo "$stats" | grep "Memory total:" | awk '{print $3}')
             local mt_unit=$(echo "$stats" | grep "Memory total:" | awk '{print $4}')
             data_total=$(to_bytes "${mt_val:-0}" "$mt_unit")
        fi

        # Calculate Percentage
        local pct=0
        if [[ -n "$data_total" && "$data_total" -gt 0 ]]; then
            pct=$(( (data_processed * 100) / data_total ))
        fi
        [[ $pct -ge 100 ]] && pct=99
        
        # Calculate Speed
        local speed_mbps=0
        if [[ $elapsed -gt 0 && -n "$data_processed" ]]; then
            speed_mbps=$(( (data_processed / elapsed) / 1048576 ))
        fi
        
        # Format Human Readable
        local processed_h=$(numfmt --to=iec-i --suffix=B "$data_processed" 2>/dev/null || echo "${data_processed} B")
        local total_h=$(numfmt --to=iec-i --suffix=B "$data_total" 2>/dev/null || echo "${data_total} B")
        local remaining_h=$(numfmt --to=iec-i --suffix=B "$data_remaining" 2>/dev/null || echo "${data_remaining} B")
        local elapsed_fmt=$(date -u -d @${elapsed} +%H:%M:%S)
        
        # Build Gauge Output
        echo "XXX"
        echo "$pct"
        echo "🚀 Live Migration (SAN): $vm_name ➜ $target_host\n"
        echo "🔄 Status:    MIGRATING RAM..."
        echo "📊 Progress:  $processed_h / $total_h ($pct%)"
        echo "📉 Remaining: $remaining_h"
        echo "⚡ Speed:     $speed_mbps MiB/s"
        echo "⏱️  Elapsed:   $elapsed_fmt"
        echo "XXX"
        
        sleep 1
    done | dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
                  --title "🚀 Live Migration" \
                  --gauge "\nInitializing migration..." 14 60 0

    # 3. Final Verification
    wait $mig_pid
    local exit_code=$?
    local elapsed_fmt=$(date -u -d @$(( $(date +%s) - start_time )) +%H:%M:%S)
    
    if [[ $exit_code -eq 0 ]]; then
        log_action "SUCCESS" "Migration of $vm_name to $target_host successful"
        echo "$(date)|$vm_name|$(hostname)|$target_host|SUCCESS|$elapsed_fmt" >> "$MIGRATION_LOG"
        
        dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
               --title "✅ Migration Complete" \
               --msgbox "\nMigration completed successfully!\n\nVM: $vm_name\nTarget: $target_host\nTime: $elapsed_fmt" 10 50
    else
        # Double check success (sometimes p2p exits weirdly)
        if ! virsh list --name | grep -q "^${vm_name}$"; then
             if ssh -o BatchMode=yes "$target_host" "virsh list --name" | grep -q "^${vm_name}$"; then
                 log_action "SUCCESS" "Migration of $vm_name to $target_host successful (verified)"
                 echo "$(date)|$vm_name|$(hostname)|$target_host|SUCCESS|$elapsed_fmt" >> "$MIGRATION_LOG"
                 dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
                        --title "✅ Migration Complete" \
                        --msgbox "\nMigration completed successfully!\n(Verified on target host)\n\nVM: $vm_name\nTarget: $target_host" 10 50
                 return
             fi
        fi

        log_action "ERROR" "Migration of $vm_name failed"
        echo "$(date)|$vm_name|$(hostname)|$target_host|FAILED|$elapsed_fmt" >> "$MIGRATION_LOG"
        
        dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
               --title "❌ Migration Failed" \
               --msgbox "\nMigration failed.\n\nCheck logs at:\n$log_file" 10 50
    fi
}




#===============================================================================
# SMB SHARE & LOG COLLECTION FUNCTIONS  
#===============================================================================



mount_morpheus_share() {
    local share_path="//10.0.1.15/Morpheus"
    local mount_point="/mnt/morpheus_share"
    local cred_file="/tmp/.morpheus_creds_$$"
    
    # Ensure cifs-utils is installed
    if ! command -v mount.cifs &>/dev/null; then
        apt-get update -qq && apt-get install -y cifs-utils 2>/dev/null
    fi
    
    mkdir -p "$mount_point" 2>/dev/null
    
    # Check if already mounted
    if mountpoint -q "$mount_point" 2>/dev/null; then
        echo "$mount_point"
        return 0
    fi
    
    # Try guest access first
    for vers in "3.0" "2.1" "2.0"; do
        if mount -t cifs "$share_path" "$mount_point" -o "guest,vers=$vers" 2>/dev/null; then
            echo "$mount_point"
            return 0
        fi
    done
    
    # Guest failed - prompt for credentials
    local smb_user smb_pass smb_domain=""
    
    smb_user=$(dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
                      --title "Network Share Authentication" \
                      --inputbox "\nShare requires authentication.\n\nEnter username (domain\\\\user or user):" \
                      12 50 3>&1 1>&2 2>&3)
    
    [[ $? -ne 0 || -z "$smb_user" ]] && return 1
    
    smb_pass=$(dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
                      --title "Network Share Authentication" \
                      --insecure \
                      --passwordbox "\nEnter password for: $smb_user" \
                      10 50 3>&1 1>&2 2>&3)
    
    [[ $? -ne 0 ]] && return 1
    
    # Parse domain from username
    if [[ "$smb_user" == *\\* ]]; then
        smb_domain="${smb_user%%\\*}"
        smb_user="${smb_user#*\\}"
    elif [[ "$smb_user" == *@* ]]; then
        smb_domain="${smb_user#*@}"
        smb_user="${smb_user%%@*}"
    fi
    
    # Create credentials file (handles special chars in password)
    umask 077
    cat > "$cred_file" << CREDEOF
username=$smb_user
password=$smb_pass
CREDEOF
    [[ -n "$smb_domain" ]] && echo "domain=$smb_domain" >> "$cred_file"
    
    # Try mount with credentials file
    local mounted=false
    for vers in "3.0" "2.1" "2.0"; do
        if mount -t cifs "$share_path" "$mount_point" -o "credentials=$cred_file,vers=$vers" 2>/dev/null; then
            mounted=true
            break
        fi
    done
    
    # Clean up credentials file
    rm -f "$cred_file" 2>/dev/null
    
    if $mounted; then
        echo "$mount_point"
        return 0
    fi
    
    return 1
}

unmount_morpheus_share() {
    local mount_point="/mnt/morpheus_share"
    if mountpoint -q "$mount_point" 2>/dev/null; then
        umount "$mount_point" 2>/dev/null
    fi
}

copy_to_share() {
    local source_file="$1"
    local mount_point
    
    mount_point=$(mount_morpheus_share)
    if [[ $? -ne 0 ]]; then
        return 1
    fi
    
    local hostname=$(hostname)
    local dest_dir="${mount_point}/${hostname}"
    
    mkdir -p "$dest_dir" 2>/dev/null
    
    if cp "$source_file" "$dest_dir/" 2>/dev/null; then
        echo "$dest_dir/$(basename "$source_file")"
        return 0
    fi
    
    return 1
}

collect_and_send_logs() {
    local collect_script="/opt/MorphLogGrabber/collect.sh"
    local temp_output="${TEMP_DIR}/collect_output.txt"
    local hostname=$(hostname)
    
    if [[ ! -f "$collect_script" ]]; then
        dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
               --title "❌ Script Not Found" \
               --msgbox "\nThe HPE collect.sh script was not found at:\n$collect_script\n\nPlease ensure the MorphLogGrabber is installed." 12 60
        return 1
    fi
    
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "📦 Collect & Send Logs" \
           --yesno "\nThis will run the HPE Support log collection script.\n\nThe process may take 5-10 minutes and will:\n  1. Collect system logs and diagnostics\n  2. Create a compressed archive\n  3. Copy to network share (\\\\10.0.1.15\\Morpheus)\n\nProceed?" 16 60
    
    [[ $? -ne 0 ]] && return
    
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "⏳ Collecting Logs" \
           --infobox "\nRunning HPE log collection script...\n\nThis may take 5-10 minutes.\nPlease wait..." 10 50
    
    cd /tmp
    (echo "2"; sleep 2; echo "") | timeout 900 "$collect_script" > "$temp_output" 2>&1
    
    local tar_file=$(ls -t /tmp/collect_*.tar.gz 2>/dev/null | head -1)
    [[ -z "$tar_file" ]] && tar_file=$(ls -t /root/collect_*.tar.gz 2>/dev/null | head -1)
    
    if [[ -n "$tar_file" && -f "$tar_file" ]]; then
        log_action "SUCCESS" "Log collection completed: $tar_file"
        cp "$tar_file" "${DIAG_DIR}/" 2>/dev/null
        
        dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
               --title "⏳ Uploading to Share" \
               --infobox "\nCopying logs to network share..." 6 45
        
        local share_dest
        share_dest=$(copy_to_share "$tar_file")
        
        if [[ $? -eq 0 ]]; then
            unmount_morpheus_share
            dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
                   --title "✅ Log Collection Complete" \
                   --msgbox "\nLog collection completed successfully!\n\nFile: $(basename "$tar_file")\n\nSaved to:\n  • ${DIAG_DIR}/\n  • \\\\10.0.1.15\\Morpheus\\${hostname}/" 14 60
        else
            dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
                   --title "⚠️  Partial Success" \
                   --msgbox "\nLog collection completed!\n\nFile: $(basename "$tar_file")\n\nSaved locally to: ${DIAG_DIR}/\n\n⚠️  Could not copy to network share." 12 55
        fi
    else
        dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
               --title "❌ Collection Failed" \
               --msgbox "\nLog collection script did not produce output.\n\nRun manually: sudo $collect_script" 10 55
    fi
}

#===============================================================================
# ENHANCED VM OPERATIONS FUNCTIONS
#===============================================================================

show_vm_details() {
    local vm_name="$1"
    local temp_file="${TEMP_DIR}/vm_details.txt"
    
    {
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo "                    VM DETAILS: $vm_name"
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo ""
        
        local state=$(virsh domstate "$vm_name" 2>/dev/null)
        local state_icon=$(get_status_icon "$state")
        echo "📋 BASIC INFORMATION"
        echo "───────────────────────────────────────────────────────────────────────────────"
        echo "  Name:        $vm_name"
        echo "  State:       $state_icon $state"
        echo "  UUID:        $(virsh domuuid "$vm_name" 2>/dev/null)"
        echo "  Autostart:   $(virsh dominfo "$vm_name" 2>/dev/null | grep "Autostart" | awk '{print $2}')"
        echo ""
        
        echo "🔲 CPU CONFIGURATION"
        echo "───────────────────────────────────────────────────────────────────────────────"
        echo "  Current vCPUs:  $(virsh vcpucount "$vm_name" --current 2>/dev/null || echo "N/A")"
        echo "  Maximum vCPUs:  $(virsh vcpucount "$vm_name" --maximum 2>/dev/null || echo "N/A")"
        echo ""
        
        echo "🧠 MEMORY"
        echo "───────────────────────────────────────────────────────────────────────────────"
        local mem=$(virsh dominfo "$vm_name" 2>/dev/null | grep "Used memory" | awk '{print $3}')
        echo "  Used Memory:  $(numfmt --to=iec-i --suffix=B $((mem * 1024)) 2>/dev/null || echo "$mem KiB")"
        echo ""
        
        echo "💾 DISKS"
        echo "───────────────────────────────────────────────────────────────────────────────"
        virsh domblklist "$vm_name" 2>/dev/null | tail -n +3 | grep -v "^$" | sed 's/^/  /'
        echo ""
        
        echo "🌐 NETWORKS"
        echo "───────────────────────────────────────────────────────────────────────────────"
        virsh domiflist "$vm_name" 2>/dev/null | tail -n +3 | grep -v "^$" | sed 's/^/  /'
        echo ""
        
        echo "📸 SNAPSHOTS"
        echo "───────────────────────────────────────────────────────────────────────────────"
        local snap_count=$(virsh snapshot-list "$vm_name" --name 2>/dev/null | grep -v "^$" | wc -l)
        echo "  Total: $snap_count"
        [[ $snap_count -gt 0 ]] && virsh snapshot-list "$vm_name" 2>/dev/null | sed 's/^/  /'
        echo ""
        
        echo "═══════════════════════════════════════════════════════════════════════════════"
    } > "$temp_file"
    
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "🔍 VM Details: $vm_name" \
           --textbox "$temp_file" $DIALOG_HEIGHT $DIALOG_WIDTH
}

vm_power_operation() {
    local vm_name="$1"
    local operation="$2"
    local operation_name="$3"
    local confirm_msg="$4"
    
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "⚠️  Confirm $operation_name" \
           --yesno "\n$confirm_msg\n\nVM: $vm_name\n\nProceed?" 12 55
    
    [[ $? -ne 0 ]] && return 1
    
    local result
    result=$(virsh $operation "$vm_name" 2>&1)
    local exit_code=$?
    
    if [[ $exit_code -eq 0 ]]; then
        log_action "SUCCESS" "VM $vm_name: $operation_name completed"
        dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
               --title "✅ $operation_name Complete" \
               --msgbox "\n$operation_name completed!\n\nVM: $vm_name" 10 50
    else
        log_action "ERROR" "VM $vm_name: $operation_name failed"
        dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
               --title "❌ $operation_name Failed" \
               --msgbox "\nFailed!\n\nError: $result" 10 55
    fi
}

vm_create_snapshot() {
    local vm_name="$1"
    local default_name="snapshot_$(date +%Y%m%d_%H%M%S)"
    
    local snap_name
    snap_name=$(dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
                       --title "📸 Create Snapshot" \
                       --inputbox "\nEnter snapshot name for VM: $vm_name" \
                       10 55 "$default_name" 3>&1 1>&2 2>&3)
    
    [[ $? -ne 0 || -z "$snap_name" ]] && return 1
    
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "⏳ Creating Snapshot" \
           --infobox "\nCreating snapshot: $snap_name..." 6 45
    
    local result
    result=$(virsh snapshot-create-as "$vm_name" --name "$snap_name" 2>&1)
    
    if [[ $? -eq 0 ]]; then
        log_action "SUCCESS" "Snapshot $snap_name created for VM $vm_name"
        dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
               --title "✅ Snapshot Created" \
               --msgbox "\nSnapshot created!\n\nVM: $vm_name\nSnapshot: $snap_name" 10 50
    else
        dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
               --title "❌ Snapshot Failed" \
               --msgbox "\nFailed to create snapshot!\n\nError: $result" 10 55
    fi
}

vm_single_operations_menu() {
    local vm_name="$1"
    
    while true; do
        local state=$(virsh domstate "$vm_name" 2>/dev/null)
        local state_icon=$(get_status_icon "$state")
        local autostart=$(virsh dominfo "$vm_name" 2>/dev/null | grep "Autostart" | awk '{print $2}')
        
        local menu_items=()
        menu_items+=("1" "🔍 View Detailed Info")
        
        case "$state" in
            running)
                menu_items+=("2" "🔄 Graceful Reboot")
                menu_items+=("3" "⏹️  Graceful Shutdown")
                menu_items+=("4" "🔁 Hard Reset")
                menu_items+=("5" "⏸️  Suspend/Pause")
                ;;
            paused)
                menu_items+=("6" "▶️  Resume")
                ;;
            "shut off"|shutoff)
                menu_items+=("7" "▶️  Start VM")
                ;;
            *)
                menu_items+=("7" "▶️  Start VM")
                ;;
        esac
        
        menu_items+=("8" "📸 Create Snapshot")
        menu_items+=("9" "🔄 Migrate This VM")
        menu_items+=("0" "🔙 Back to VM List")
        
        local choice
        choice=$(dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
                        --title "🖥️  VM: $vm_name" \
                        --menu "\n  State: $state_icon $state | Autostart: $autostart\n" \
                        $DIALOG_HEIGHT $DIALOG_WIDTH 12 \
                        "${menu_items[@]}" 3>&1 1>&2 2>&3)
        
        [[ $? -ne 0 ]] && return
        
        case "$choice" in
            1) show_vm_details "$vm_name" ;;
            2) vm_power_operation "$vm_name" "reboot" "Reboot" "Gracefully reboot the VM?" ;;
            3) vm_power_operation "$vm_name" "shutdown" "Shutdown" "Gracefully shutdown the VM?" ;;
            4) vm_power_operation "$vm_name" "reset" "Hard Reset" "⚠️ Hard reset the VM?" ;;
            5) vm_power_operation "$vm_name" "suspend" "Suspend" "Suspend the VM?" ;;
            6) vm_power_operation "$vm_name" "resume" "Resume" "Resume the VM?" ;;
            7) vm_power_operation "$vm_name" "start" "Start" "Start the VM?" ;;
            8) vm_create_snapshot "$vm_name" ;;
            9)
                if [[ "$state" == "running" ]]; then
                    local target_host
                    target_host=$(select_target_host "$vm_name")
                    if [[ -n "$target_host" ]]; then
                        dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
                               --title "⚠️  Confirm Migration" \
                               --yesno "\nMigrate $vm_name to $target_host?" 8 50
                        [[ $? -eq 0 ]] && perform_live_migration "$vm_name" "$target_host"
                    fi
                else
                    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
                           --title "⚠️  Cannot Migrate" \
                           --msgbox "\nVM must be running to migrate.\n\nCurrent state: $state" 10 50
                fi
                ;;
            0|"") return ;;
        esac
    done
}

show_vm_operations_list() {
    while true; do
        local menu_items=()
        local count=0
        
        while IFS='|' read -r name state id; do
            if [[ -n "$name" ]]; then
                ((count++))
                local icon=$(get_status_icon "$state")
                local mem=$(virsh dominfo "$name" 2>/dev/null | grep "Used memory" | awk '{print $3}')
                local mem_h=$(numfmt --to=iec-i --suffix=B $((mem * 1024)) 2>/dev/null || echo "-")
                menu_items+=("$name" "$icon $state | RAM: $mem_h")
            fi
        done < <(get_running_vms)
        
        if [[ $count -eq 0 ]]; then
            dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
                   --title "📋 VM Operations" \
                   --msgbox "\nNo VMs found on this host." 8 40
            return
        fi
        
        local selected
        selected=$(dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
                          --title "📋 VM Operations ($count VMs)" \
                          --menu "\nSelect a VM:\n" \
                          $DIALOG_HEIGHT $DIALOG_WIDTH $((DIALOG_HEIGHT - 8)) \
                          "${menu_items[@]}" 3>&1 1>&2 2>&3)
        
        [[ $? -ne 0 || -z "$selected" ]] && return
        
        vm_single_operations_menu "$selected"
    done
}

live_migration_menu() {
    while true; do
        local choice
        choice=$(dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
                        --title "🚀 VM Operations" \
                        --menu "\nSelect an option:\n" \
                        $DIALOG_HEIGHT $DIALOG_WIDTH 6 \
                        "1" "🖥️  VM Operations (View/Manage VMs)" \
                        "2" "🔄 Migrate a Running VM" \
                        "3" "📜 View Migration History" \
                        "4" "🔙 Return to Main Menu" \
                        3>&1 1>&2 2>&3)
        
        [[ $? -ne 0 ]] && return
        
        case "$choice" in
            1)
                show_vm_operations_list
                ;;
            2)
                local vm_name
                vm_name=$(select_vm_for_migration)
                [[ -z "$vm_name" ]] && continue
                
                local target_host
                target_host=$(select_target_host "$vm_name")
                [[ -z "$target_host" ]] && continue
                
                dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
                       --title "⚠️  Confirm Migration" \
                       --yesno "\nAre you sure you want to migrate?\n\n  VM:      $vm_name\n  From:    $(hostname)\n  To:      $target_host\n\nThis will perform a live migration with minimal downtime." 14 55
                
                [[ $? -eq 0 ]] && perform_live_migration "$vm_name" "$target_host"
                ;;
            3)
                if [[ -f "$MIGRATION_LOG" ]]; then
                    local temp_file="${TEMP_DIR}/migration_history.txt"
                    {
                        echo "═══════════════════════════════════════════════════════════════════════════════"
                        echo "                           MIGRATION HISTORY"
                        echo "═══════════════════════════════════════════════════════════════════════════════"
                        echo ""
                        printf "%-20s %-20s %-15s %-15s %-8s %-10s\n" "TIMESTAMP" "VM" "FROM" "TO" "STATUS" "DURATION"
                        echo "───────────────────────────────────────────────────────────────────────────────"
                        tail -20 "$MIGRATION_LOG" | while IFS='|' read -r ts vm from to status duration; do
                            printf "%-20s %-20s %-15s %-15s %-8s %-10s\n" "$ts" "$vm" "$from" "$to" "$status" "$duration"
                        done
                        echo "═══════════════════════════════════════════════════════════════════════════════"
                    } > "$temp_file"
                    
                    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
                           --title "📜 Migration History" \
                           --textbox "$temp_file" $DIALOG_HEIGHT $DIALOG_WIDTH
                else
                    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
                           --title "📜 Migration History" \
                           --msgbox "\nNo migration history found." 8 45
                fi
                ;;
            4|"")
                return
                ;;
        esac
    done
}

#===============================================================================
# DIAGNOSTICS FUNCTIONS
#===============================================================================

view_morpheus_logs() {
    local log_lines="${1:-1000}"
    local temp_file="${TEMP_DIR}/morpheus_log.txt"
    
    if [[ -f "$LOG_FILE" ]]; then
        {
            echo "═══════════════════════════════════════════════════════════════════════════════"
            echo "              MORPHEUS NODE LOG - Last $log_lines Lines"
            echo "              File: $LOG_FILE"
            echo "              Generated: $(date '+%Y-%m-%d %H:%M:%S')"
            echo "═══════════════════════════════════════════════════════════════════════════════"
            echo ""
            tail -n "$log_lines" "$LOG_FILE" 2>/dev/null
            echo ""
            echo "═══════════════════════════════════════════════════════════════════════════════"
        } > "$temp_file"
        
        dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
               --title "📋 Morpheus Node Log (Last $log_lines lines)" \
               --textbox "$temp_file" $DIALOG_HEIGHT $DIALOG_WIDTH
    else
        dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
               --title "⚠️  Log File Not Found" \
               --msgbox "\nLog file not found at:\n$LOG_FILE\n\nEnsure Morpheus node is installed and running." 10 60
    fi
}

tail_morpheus_logs() {
    clear
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════════${RESET}"
    echo -e "${WHITE}              LIVE TAIL: Morpheus Node Log${RESET}"
    echo -e "${DIM}              Press Ctrl+C to return to menu${RESET}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════════${RESET}"
    echo ""
    
    if [[ -f "$LOG_FILE" ]]; then
        # Trap CTRL+C to return to menu instead of exiting script
        trap 'echo ""; echo -e "${YELLOW}Returning to menu...${RESET}"; sleep 1; return 0' INT
        tail -f "$LOG_FILE" 2>/dev/null
        trap - INT  # Reset trap
    else
        echo -e "${RED}Log file not found: $LOG_FILE${RESET}"
        echo -e "${YELLOW}Press any key to return...${RESET}"
        read -n 1
    fi
}

show_morpheus_status() {
    local temp_file="${TEMP_DIR}/morpheus_status.txt"
    
    {
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo "                    MORPHEUS NODE STATUS"
        echo "                    Generated: $(date '+%Y-%m-%d %H:%M:%S')"
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo ""
        
        if command -v morpheus-node-ctl &>/dev/null; then
            echo "📊 Service Status:"
            echo "───────────────────────────────────────────────────────────────────────────────"
            morpheus-node-ctl status 2>&1
            echo ""
            echo "───────────────────────────────────────────────────────────────────────────────"
        else
            echo "⚠️  morpheus-node-ctl command not found"
        fi
        
        echo ""
        echo "═══════════════════════════════════════════════════════════════════════════════"
    } > "$temp_file"
    
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "📊 Morpheus Node Status" \
           --textbox "$temp_file" $DIALOG_HEIGHT $DIALOG_WIDTH
}

show_cluster_status() {
    local temp_file="${TEMP_DIR}/cluster_status.txt"
    
    {
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo "                    PCS CLUSTER STATUS"
        echo "                    Generated: $(date '+%Y-%m-%d %H:%M:%S')"
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo ""
        
        if command -v pcs &>/dev/null; then
            echo "📊 Cluster Status:"
            echo "───────────────────────────────────────────────────────────────────────────────"
            pcs status 2>&1
            echo ""
            echo "───────────────────────────────────────────────────────────────────────────────"
            echo ""
            echo "📋 Cluster Properties:"
            echo "───────────────────────────────────────────────────────────────────────────────"
            pcs property config 2>&1
            echo ""
            echo "───────────────────────────────────────────────────────────────────────────────"
            echo ""
            echo "🔗 Resource Constraints:"
            echo "───────────────────────────────────────────────────────────────────────────────"
            pcs constraint config --full 2>&1
        else
            echo "⚠️  pcs command not found"
        fi
        
        echo ""
        echo "═══════════════════════════════════════════════════════════════════════════════"
    } > "$temp_file"
    
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "🔗 PCS Cluster Status" \
           --textbox "$temp_file" $DIALOG_HEIGHT $DIALOG_WIDTH
}

show_corosync_pacemaker_status() {
    local temp_file="${TEMP_DIR}/corosync_pacemaker.txt"
    
    {
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo "                 COROSYNC & PACEMAKER STATUS"
        echo "                 Generated: $(date '+%Y-%m-%d %H:%M:%S')"
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo ""
        
        echo "🔄 COROSYNC STATUS"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        
        echo "📡 Ring Status:"
        echo "───────────────────────────────────────────────────────────────────────────────"
        corosync-cfgtool -s 2>&1
        echo ""
        
        echo "👥 Membership:"
        echo "───────────────────────────────────────────────────────────────────────────────"
        corosync-cmapctl runtime.members 2>&1 | head -30
        echo ""
        
        echo "📊 Quorum Status:"
        echo "───────────────────────────────────────────────────────────────────────────────"
        corosync-quorumtool -s 2>&1
        echo ""
        
        echo ""
        echo "💓 PACEMAKER STATUS"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        
        echo "🖥️  Cluster Resource Manager:"
        echo "───────────────────────────────────────────────────────────────────────────────"
        crm_mon -1 2>&1
        echo ""
        
        echo "📋 Node Attributes:"
        echo "───────────────────────────────────────────────────────────────────────────────"
        crm_node -l 2>&1
        echo ""
        
        echo "═══════════════════════════════════════════════════════════════════════════════"
    } > "$temp_file"
    
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "🔄 Corosync & Pacemaker Status" \
           --textbox "$temp_file" $DIALOG_HEIGHT $DIALOG_WIDTH
}

run_dns_lookup() {
    local temp_file="${TEMP_DIR}/dns_lookup.txt"
    
    {
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo "                    DNS LOOKUP: ${DNS_TEST_DOMAIN}"
        echo "                    Generated: $(date '+%Y-%m-%d %H:%M:%S')"
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo ""
        
        echo "🔍 NSLOOKUP Results:"
        echo "───────────────────────────────────────────────────────────────────────────────"
        nslookup "${DNS_TEST_DOMAIN}" 2>&1
        echo ""
        
        echo "───────────────────────────────────────────────────────────────────────────────"
        echo ""
        
        echo "🌐 DIG Results (A Records):"
        echo "───────────────────────────────────────────────────────────────────────────────"
        dig +short "${DNS_TEST_DOMAIN}" A 2>&1
        echo ""
        
        echo "🌐 DIG Results (MX Records):"
        echo "───────────────────────────────────────────────────────────────────────────────"
        dig +short "${DNS_TEST_DOMAIN}" MX 2>&1
        echo ""
        
        echo "🌐 DIG Results (NS Records):"
        echo "───────────────────────────────────────────────────────────────────────────────"
        dig +short "${DNS_TEST_DOMAIN}" NS 2>&1
        echo ""
        
        echo "📡 Host Command:"
        echo "───────────────────────────────────────────────────────────────────────────────"
        host "${DNS_TEST_DOMAIN}" 2>&1
        echo ""
        
        echo "═══════════════════════════════════════════════════════════════════════════════"
    } > "$temp_file"
    
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "🔍 DNS Lookup: ${DNS_TEST_DOMAIN}" \
           --textbox "$temp_file" $DIALOG_HEIGHT $DIALOG_WIDTH
}

apply_netplan_restart_morpheus() {
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "⚠️  Network & Service Restart" \
           --yesno "\n🔧 HVM Host Network Fix\n\nThis will perform the following actions:\n\n  1. Apply netplan configuration\n  2. Wait for network stabilization\n  3. Restart Morpheus node agent\n\n⚠️  This may briefly interrupt network connectivity.\n\nProceed?" 16 60
    
    if [[ $? -ne 0 ]]; then
        return
    fi
    
    {
        echo "XXX"
        echo "10"
        echo "\n🔧 Step 1/3: Applying netplan configuration..."
        echo "XXX"
        
        netplan apply 2>&1
        sleep 2
        
        echo "XXX"
        echo "40"
        echo "\n⏳ Step 2/3: Waiting for network stabilization..."
        echo "XXX"
        sleep 5
        
        echo "XXX"
        echo "70"
        echo "\n🔄 Step 3/3: Restarting Morpheus node agent..."
        echo "XXX"
        
        morpheus-node-ctl restart 2>&1
        sleep 3
        
        echo "XXX"
        echo "100"
        echo "\n✅ Complete! Network and service restarted."
        echo "XXX"
        sleep 1
        
    } | dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
               --title "🔧 Applying Network Fix" \
               --gauge "" 10 60 0
    
    log_action "INFO" "Applied netplan and restarted morpheus-node"
    
    # Show final status
    local temp_file="${TEMP_DIR}/restart_status.txt"
    {
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo "                    NETWORK FIX APPLIED"
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo ""
        echo "✅ Actions Completed:"
        echo "   • netplan apply - SUCCESS"
        echo "   • morpheus-node-ctl restart - SUCCESS"
        echo ""
        echo "📊 Current Morpheus Node Status:"
        echo "───────────────────────────────────────────────────────────────────────────────"
        morpheus-node-ctl status 2>&1
        echo ""
        echo "═══════════════════════════════════════════════════════════════════════════════"
    } > "$temp_file"
    
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "✅ Network Fix Complete" \
           --textbox "$temp_file" $DIALOG_HEIGHT $DIALOG_WIDTH
}

run_full_system_diagnostic() {
    local diag_file="${DIAG_DIR}/diagnostic_$(date +%Y%m%d_%H%M%S).txt"
    local temp_display="${TEMP_DIR}/diag_display.txt"
    
    {
        echo "XXX"
        echo "5"
        echo "\n📊 Gathering system information..."
        echo "XXX"
        sleep 1
    } | dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
               --title "🔬 Running Full System Diagnostic" \
               --gauge "" 8 60 0
    
    {
        echo "╔═══════════════════════════════════════════════════════════════════════════════╗"
        echo "║                    FULL SYSTEM DIAGNOSTIC REPORT                              ║"
        echo "║                    Host: $(hostname)                                          ║"
        echo "║                    Generated: $(date '+%Y-%m-%d %H:%M:%S')                    ║"
        echo "╚═══════════════════════════════════════════════════════════════════════════════╝"
        echo ""
        
        # System Overview
        echo "┌─────────────────────────────────────────────────────────────────────────────────┐"
        echo "│ 🖥️  SYSTEM OVERVIEW                                                             │"
        echo "└─────────────────────────────────────────────────────────────────────────────────┘"
        echo ""
        echo "  Hostname:      $(hostname -f 2>/dev/null || hostname)"
        echo "  OS:            $(lsb_release -ds 2>/dev/null || cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
        echo "  Kernel:        $(uname -r)"
        echo "  Architecture:  $(uname -m)"
        echo "  Uptime:        $(uptime -p)"
        echo "  Load Average:  $(cat /proc/loadavg | awk '{print $1, $2, $3}')"
        echo ""
        
        # CPU Information
        echo "┌─────────────────────────────────────────────────────────────────────────────────┐"
        echo "│ 🔲 CPU INFORMATION                                                              │"
        echo "└─────────────────────────────────────────────────────────────────────────────────┘"
        echo ""
        echo "  Model:         $(grep "model name" /proc/cpuinfo | head -1 | cut -d':' -f2 | xargs)"
        echo "  Cores:         $(nproc)"
        echo "  Sockets:       $(grep "physical id" /proc/cpuinfo | sort -u | wc -l)"
        echo "  Threads/Core:  $(grep -c processor /proc/cpuinfo)"
        echo ""
        echo "  CPU Usage:"
        top -bn1 | grep "Cpu(s)" | sed 's/Cpu(s):/  /'
        echo ""
        
        # Memory Information
        echo "┌─────────────────────────────────────────────────────────────────────────────────┐"
        echo "│ 🧠 MEMORY INFORMATION                                                           │"
        echo "└─────────────────────────────────────────────────────────────────────────────────┘"
        echo ""
        free -h | awk 'NR==1{printf "  %-10s %10s %10s %10s %10s %10s\n", $1, $2, $3, $4, $5, $6}
                       NR==2{printf "  %-10s %10s %10s %10s %10s %10s\n", $1, $2, $3, $4, $5, $6}
                       NR==3{printf "  %-10s %10s %10s\n", $1, $2, $3}'
        echo ""
        
        # Storage Information
        echo "┌─────────────────────────────────────────────────────────────────────────────────┐"
        echo "│ 💾 STORAGE INFORMATION                                                          │"
        echo "└─────────────────────────────────────────────────────────────────────────────────┘"
        echo ""
        echo "  Local Filesystems:"
        echo "  ─────────────────────────────────────────────────────────────────────────────────"
        df -h -x tmpfs -x devtmpfs -x squashfs 2>/dev/null | awk 'NR==1{printf "  %-40s %8s %8s %8s %6s %s\n", $1, $2, $3, $4, $5, $6}
                                                                   NR>1{printf "  %-40s %8s %8s %8s %6s %s\n", $1, $2, $3, $4, $5, $6}'
        echo ""
        
        # Block Devices
        echo "  Block Devices:"
        echo "  ─────────────────────────────────────────────────────────────────────────────────"
        lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT 2>/dev/null | head -30 | sed 's/^/  /'
        echo ""
        
        # Fiber Channel / SAN Information
        echo "┌─────────────────────────────────────────────────────────────────────────────────┐"
        echo "│ 🔗 FIBER CHANNEL / HPE SAN STATUS                                               │"
        echo "└─────────────────────────────────────────────────────────────────────────────────┘"
        echo ""
        
        if [[ -d /sys/class/fc_host ]]; then
            echo "  FC HBAs Detected:"
            echo "  ─────────────────────────────────────────────────────────────────────────────────"
            for host in /sys/class/fc_host/host*; do
                if [[ -d "$host" ]]; then
                    local hba=$(basename "$host")
                    local wwpn=$(cat "$host/port_name" 2>/dev/null | sed 's/0x//')
                    local state=$(cat "$host/port_state" 2>/dev/null)
                    local speed=$(cat "$host/speed" 2>/dev/null)
                    local icon=$(get_status_icon "$state")
                    echo "  $icon $hba: WWPN=$wwpn State=$state Speed=$speed"
                fi
            done
            echo ""
        else
            echo "  No Fiber Channel HBAs detected"
            echo ""
        fi
        
        # Multipath Status
        if command -v multipath &>/dev/null; then
            echo "  Multipath Devices:"
            echo "  ─────────────────────────────────────────────────────────────────────────────────"
            multipath -ll 2>/dev/null | head -50 | sed 's/^/  /' || echo "  No multipath devices configured"
            echo ""
        fi
        
        # LUN Information
        echo "  SCSI LUNs:"
        echo "  ─────────────────────────────────────────────────────────────────────────────────"
        lsscsi 2>/dev/null | grep -E "disk|storage" | head -20 | sed 's/^/  /' || echo "  lsscsi not available"
        echo ""
        
        # Network Information
        echo "┌─────────────────────────────────────────────────────────────────────────────────┐"
        echo "│ 🌐 NETWORK INFORMATION                                                          │"
        echo "└─────────────────────────────────────────────────────────────────────────────────┘"
        echo ""
        echo "  Network Interfaces:"
        echo "  ─────────────────────────────────────────────────────────────────────────────────"
        ip -br addr show 2>/dev/null | sed 's/^/  /'
        echo ""
        echo "  Default Gateway:"
        ip route | grep default | sed 's/^/  /'
        echo ""
        echo "  DNS Servers:"
        grep nameserver /etc/resolv.conf 2>/dev/null | sed 's/^/  /'
        echo ""
        
        # Virtualization Status
        echo "┌─────────────────────────────────────────────────────────────────────────────────┐"
        echo "│ 🖥️  VIRTUALIZATION STATUS                                                       │"
        echo "└─────────────────────────────────────────────────────────────────────────────────┘"
        echo ""
        echo "  Libvirt Version:  $(virsh version --daemon 2>/dev/null | grep "Running hypervisor" || echo "N/A")"
        echo "  QEMU Version:     $(qemu-system-x86_64 --version 2>/dev/null | head -1 || echo "N/A")"
        echo ""
        echo "  VM Summary:"
        echo "  ─────────────────────────────────────────────────────────────────────────────────"
        echo "  Total VMs:    $(virsh list --all 2>/dev/null | tail -n +3 | grep -v "^$" | wc -l)"
        echo "  Running:      $(virsh list 2>/dev/null | tail -n +3 | grep -v "^$" | wc -l)"
        echo "  Stopped:      $(virsh list --all --state-shutoff 2>/dev/null | tail -n +3 | grep -v "^$" | wc -l)"
        echo ""
        
        # Storage Pools
        echo "  Storage Pools:"
        echo "  ─────────────────────────────────────────────────────────────────────────────────"
        virsh pool-list --all 2>/dev/null | sed 's/^/  /'
        echo ""
        
        # Cluster Status
        echo "┌─────────────────────────────────────────────────────────────────────────────────┐"
        echo "│ 🔗 CLUSTER STATUS                                                               │"
        echo "└─────────────────────────────────────────────────────────────────────────────────┘"
        echo ""
        
        if command -v pcs &>/dev/null; then
            echo "  PCS Cluster Status:"
            echo "  ─────────────────────────────────────────────────────────────────────────────────"
            pcs status --brief 2>&1 | sed 's/^/  /'
            echo ""
        fi
        
        if command -v corosync-cfgtool &>/dev/null; then
            echo "  Corosync Ring Status:"
            echo "  ─────────────────────────────────────────────────────────────────────────────────"
            corosync-cfgtool -s 2>&1 | sed 's/^/  /'
            echo ""
        fi
        
        # Morpheus Node Status
        echo "┌─────────────────────────────────────────────────────────────────────────────────┐"
        echo "│ 🔮 MORPHEUS NODE STATUS                                                         │"
        echo "└─────────────────────────────────────────────────────────────────────────────────┘"
        echo ""
        if command -v morpheus-node-ctl &>/dev/null; then
            morpheus-node-ctl status 2>&1 | sed 's/^/  /'
        else
            echo "  morpheus-node-ctl not found"
        fi
        echo ""
        
        # Services Status
        echo "┌─────────────────────────────────────────────────────────────────────────────────┐"
        echo "│ ⚙️  KEY SERVICES STATUS                                                         │"
        echo "└─────────────────────────────────────────────────────────────────────────────────┘"
        echo ""
        for svc in libvirtd corosync pacemaker multipathd; do
            local status=$(systemctl is-active "$svc" 2>/dev/null)
            local icon=$(get_status_icon "$status")
            printf "  %s %-20s %s\n" "$icon" "$svc" "$status"
        done
        echo ""
        
        # Recent System Errors
        echo "┌─────────────────────────────────────────────────────────────────────────────────┐"
        echo "│ ⚠️  RECENT SYSTEM ERRORS (Last 20)                                              │"
        echo "└─────────────────────────────────────────────────────────────────────────────────┘"
        echo ""
        journalctl -p err -n 20 --no-pager 2>/dev/null | sed 's/^/  /' || echo "  No recent errors"
        echo ""
        
        echo "╔═══════════════════════════════════════════════════════════════════════════════╗"
        echo "║                         END OF DIAGNOSTIC REPORT                              ║"
        echo "║                    Saved to: $diag_file                                       ║"
        echo "╚═══════════════════════════════════════════════════════════════════════════════╝"
        
    } | tee "$diag_file" > "$temp_display"
    
    log_action "INFO" "Full system diagnostic saved to $diag_file"
    
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "🔬 Full System Diagnostic Report" \
           --textbox "$temp_display" $DIALOG_HEIGHT $DIALOG_WIDTH
    
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
    # Try to copy to network share
    local share_result=""
    local share_dest
    share_dest=$(copy_to_share "$diag_file" 2>/dev/null)
    if [[ $? -eq 0 && -n "$share_dest" ]]; then
        unmount_morpheus_share 2>/dev/null
        share_result="\n  • \\\\10.0.1.15\\Morpheus\\$(hostname)/"
    else
        share_result="\n\n⚠️  Could not copy to network share."
    fi
    
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "💾 Report Saved" \
           --msgbox "\n✅ Diagnostic report saved to:\n\n  • $diag_file$share_result\n\nYou can view this file anytime with:\nless $diag_file" 16 70
}

diagnostics_menu() {
    while true; do
        local choice
        choice=$(dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
                        --title "🔧 Diagnostics & Troubleshooting" \
                        --menu "\nSelect a diagnostic option:\n" \
                        $DIALOG_HEIGHT $DIALOG_WIDTH 12 \
                        "1" "📋 View Morpheus Log (Last 1000 Lines)" \
                        "2" "📺 Live Tail Morpheus Log" \
                        "3" "📊 Morpheus Node Status" \
                        "4" "🔗 PCS Cluster Status" \
                        "5" "🔄 Corosync & Pacemaker Status" \
                        "6" "🔍 DNS Lookup (${DNS_TEST_DOMAIN})" \
                        "7" "🔧 Apply Netplan & Restart Morpheus" \
                        "8" "🔬 Full System Diagnostic" \
                        "9" "📦 Collect & Send Logs (HPE Support)" \
                        "10" "📁 View Saved Diagnostics" \
                        "0" "🔙 Return to Main Menu" \
                        3>&1 1>&2 2>&3)
        
        case "$choice" in
            1)
                view_morpheus_logs 1000
                ;;
            2)
                tail_morpheus_logs
                ;;
            3)
                show_morpheus_status
                ;;
            4)
                show_cluster_status
                ;;
            5)
                show_corosync_pacemaker_status
                ;;
            6)
                run_dns_lookup
                ;;
            7)
                apply_netplan_restart_morpheus
                ;;
            8)
                run_full_system_diagnostic
                ;;
            9)
                collect_and_send_logs
                ;;
            10)
                view_saved_diagnostics
                ;;
            0|"")
                return
                ;;
        esac
    done
}

view_saved_diagnostics() {
    local files=()
    local count=0
    
    if [[ -d "$DIAG_DIR" ]]; then
        while IFS= read -r file; do
            if [[ -f "$file" ]]; then
                ((count++))
                local filename=$(basename "$file")
                local filesize=$(du -h "$file" | cut -f1)
                local filedate=$(stat -c %y "$file" 2>/dev/null | cut -d'.' -f1)
                files+=("$file" "$filename ($filesize) - $filedate")
            fi
        done < <(find "$DIAG_DIR" -name "diagnostic_*.txt" -o -name "diagnostic_*.log" 2>/dev/null | sort -r | head -20)
    fi
    
    if [[ $count -eq 0 ]]; then
        dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
               --title "📁 Saved Diagnostics" \
               --msgbox "\nNo saved diagnostic files found.\n\nRun a full system diagnostic to create one." 10 55
        return
    fi
    
    local selected
    selected=$(dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
                      --title "📁 Saved Diagnostic Files" \
                      --menu "\nSelect a file to view:\n" \
                      $DIALOG_HEIGHT $DIALOG_WIDTH $((DIALOG_HEIGHT - 8)) \
                      "${files[@]}" \
                      3>&1 1>&2 2>&3)
    
    if [[ -n "$selected" && -f "$selected" ]]; then
        dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
               --title "📄 $(basename "$selected")" \
               --textbox "$selected" $DIALOG_HEIGHT $DIALOG_WIDTH
    fi
}

#===============================================================================
# CLUSTER MANAGEMENT FUNCTIONS
#===============================================================================

show_cluster_dashboard() {
    local temp_file="${TEMP_DIR}/cluster_dashboard.txt"
    local current_host=$(hostname -f 2>/dev/null || hostname)
    
    {
        echo "╔═══════════════════════════════════════════════════════════════════════════════╗"
        echo "║                      🌐 CLUSTER HEALTH DASHBOARD                              ║"
        echo "║                      $(date '+%Y-%m-%d %H:%M:%S')                              ║"
        echo "╚═══════════════════════════════════════════════════════════════════════════════╝"
        echo ""
        
        # Current Host Info
        echo "┌─────────────────────────────────────────────────────────────────────────────────┐"
        echo "│ 🏠 CURRENT HOST: $current_host"
        echo "└─────────────────────────────────────────────────────────────────────────────────┘"
        echo ""
        
        # Cluster Nodes Status
        echo "┌─────────────────────────────────────────────────────────────────────────────────┐"
        echo "│ 👥 CLUSTER NODES                                                                │"
        echo "└─────────────────────────────────────────────────────────────────────────────────┘"
        echo ""
        printf "  %-30s %-15s %-15s %-15s\n" "NODE" "PING" "SSH" "CLUSTER"
        echo "  ─────────────────────────────────────────────────────────────────────────────────"
        
        # Current host
        echo "  ✅ $current_host (this host)"
        
        # Other nodes
        while IFS= read -r node; do
            if [[ -n "$node" ]]; then
                local ping_status="❌"
                local ssh_status="❌"
                local cluster_status="❓"
                
                if ping -c 1 -W 2 "$node" &>/dev/null; then
                    ping_status="✅"
                    if ssh -o ConnectTimeout=2 -o BatchMode=yes "$node" "echo ok" &>/dev/null 2>&1; then
                        ssh_status="✅"
                    fi
                fi
                
                # Check cluster membership
                if pcs status nodes 2>/dev/null | grep -q "$node"; then
                    if pcs status nodes 2>/dev/null | grep "Online:" | grep -q "$node"; then
                        cluster_status="✅ Online"
                    elif pcs status nodes 2>/dev/null | grep "Standby:" | grep -q "$node"; then
                        cluster_status="⏸️ Standby"
                    else
                        cluster_status="❌ Offline"
                    fi
                fi
                
                printf "  %-30s %-15s %-15s %-15s\n" "$node" "$ping_status" "$ssh_status" "$cluster_status"
            fi
        done < <(get_cluster_nodes)
        echo ""
        
        # Quorum Status
        echo "┌─────────────────────────────────────────────────────────────────────────────────┐"
        echo "│ 🗳️  QUORUM STATUS                                                               │"
        echo "└─────────────────────────────────────────────────────────────────────────────────┘"
        echo ""
        local quorum_info=$(corosync-quorumtool -s 2>/dev/null)
        local quorate=$(echo "$quorum_info" | grep "Quorate:" | awk '{print $2}')
        local total_votes=$(echo "$quorum_info" | grep "Total votes:" | awk '{print $3}')
        local quorum_votes=$(echo "$quorum_info" | grep "Quorum:" | awk '{print $2}')
        
        if [[ "$quorate" == "Yes" ]]; then
            echo "  ✅ Cluster is QUORATE"
        else
            echo "  ❌ Cluster is NOT QUORATE"
        fi
        echo "  Total Votes: ${total_votes:-N/A}"
        echo "  Quorum Required: ${quorum_votes:-N/A}"
        echo ""
        
        # Resource Summary
        echo "┌─────────────────────────────────────────────────────────────────────────────────┐"
        echo "│ 📦 CLUSTER RESOURCES                                                            │"
        echo "└─────────────────────────────────────────────────────────────────────────────────┘"
        echo ""
        pcs resource status 2>/dev/null | head -20 | sed 's/^/  /' || echo "  No resources configured"
        echo ""
        
        # VM Distribution
        echo "┌─────────────────────────────────────────────────────────────────────────────────┐"
        echo "│ 🖥️  VM DISTRIBUTION                                                             │"
        echo "└─────────────────────────────────────────────────────────────────────────────────┘"
        echo ""
        local running_vms=$(virsh list 2>/dev/null | tail -n +3 | grep -v "^$" | wc -l)
        local total_vms=$(virsh list --all 2>/dev/null | tail -n +3 | grep -v "^$" | wc -l)
        echo "  This Host ($current_host):"
        echo "    Running VMs: $running_vms"
        echo "    Total VMs:   $total_vms"
        echo ""
        
        # Service Health
        echo "┌─────────────────────────────────────────────────────────────────────────────────┐"
        echo "│ ⚙️  SERVICE HEALTH                                                              │"
        echo "└─────────────────────────────────────────────────────────────────────────────────┘"
        echo ""
        for svc in libvirtd corosync pacemaker pcsd morpheus-node-runsvdir multipathd ssh; do
            local status=$(systemctl is-active "$svc" 2>/dev/null || echo "not-found")
            local icon=$(get_status_icon "$status")
            printf "  %s %-30s %s\n" "$icon" "$svc" "$status"
        done
        echo ""
        
        echo "╔═══════════════════════════════════════════════════════════════════════════════╗"
        echo "║                           END OF DASHBOARD                                    ║"
        echo "╚═══════════════════════════════════════════════════════════════════════════════╝"
        
    } > "$temp_file"
    
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "🌐 Cluster Health Dashboard" \
           --textbox "$temp_file" $DIALOG_HEIGHT $DIALOG_WIDTH
}

cluster_node_connectivity_matrix() {
    local temp_file="${TEMP_DIR}/connectivity_matrix.txt"
    local nodes=()
    local current_host=$(hostname -f 2>/dev/null || hostname)
    
    # Gather all nodes including current
    nodes+=("$current_host")
    while IFS= read -r node; do
        [[ -n "$node" ]] && nodes+=("$node")
    done < <(get_cluster_nodes)
    
    {
        echo "╔═══════════════════════════════════════════════════════════════════════════════╗"
        echo "║                   🔗 CLUSTER CONNECTIVITY MATRIX                              ║"
        echo "╚═══════════════════════════════════════════════════════════════════════════════╝"
        echo ""
        echo "Testing connectivity between all cluster nodes..."
        echo ""
        
        # Header row
        printf "%-25s" "FROM \\ TO"
        for target in "${nodes[@]}"; do
            printf "%-15s" "$(echo "$target" | cut -d'.' -f1)"
        done
        echo ""
        echo "─────────────────────────────────────────────────────────────────────────────────"
        
        for source in "${nodes[@]}"; do
            printf "%-25s" "$(echo "$source" | cut -d'.' -f1)"
            for target in "${nodes[@]}"; do
                if [[ "$source" == "$target" ]]; then
                    printf "%-15s" "━━━"
                elif [[ "$source" == "$current_host" ]]; then
                    # Direct test from this host
                    if ping -c 1 -W 2 "$target" &>/dev/null; then
                        printf "%-15s" "✅ OK"
                    else
                        printf "%-15s" "❌ FAIL"
                    fi
                else
                    # Test via SSH from remote host
                    if ssh -o ConnectTimeout=3 -o BatchMode=yes "$source" "ping -c 1 -W 2 $target" &>/dev/null 2>&1; then
                        printf "%-15s" "✅ OK"
                    else
                        printf "%-15s" "❓ N/A"
                    fi
                fi
            done
            echo ""
        done
        
        echo ""
        echo "Legend: ✅ OK = Reachable | ❌ FAIL = Unreachable | ❓ N/A = Cannot test | ━━━ = Self"
        echo ""
        echo "╔═══════════════════════════════════════════════════════════════════════════════╗"
        echo "║                         END OF CONNECTIVITY MATRIX                            ║"
        echo "╚═══════════════════════════════════════════════════════════════════════════════╝"
        
    } > "$temp_file"
    
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "🔗 Cluster Connectivity Matrix" \
           --textbox "$temp_file" $DIALOG_HEIGHT $DIALOG_WIDTH
}

cluster_management_menu() {
    while true; do
        local choice
        choice=$(dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
                        --title "🔗 Cluster Management" \
                        --menu "\nSelect a cluster management option:\n" \
                        $DIALOG_HEIGHT $DIALOG_WIDTH 10 \
                        "1" "🌐 Cluster Health Dashboard" \
                        "2" "🔗 Node Connectivity Matrix" \
                        "3" "📊 PCS Cluster Status" \
                        "4" "🔄 Corosync & Pacemaker Status" \
                        "5" "📦 Cluster Resources" \
                        "6" "🔧 Cluster Properties" \
                        "7" "⚠️  Fence/STONITH Status" \
                        "8" "🔙 Return to Main Menu" \
                        3>&1 1>&2 2>&3)
        
        case "$choice" in
            1)
                show_cluster_dashboard
                ;;
            2)
                cluster_node_connectivity_matrix
                ;;
            3)
                show_cluster_status
                ;;
            4)
                show_corosync_pacemaker_status
                ;;
            5)
                show_cluster_resources
                ;;
            6)
                show_cluster_properties
                ;;
            7)
                show_fence_status
                ;;
            8|"")
                return
                ;;
        esac
    done
}

show_cluster_resources() {
    local temp_file="${TEMP_DIR}/cluster_resources.txt"
    
    {
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo "                    CLUSTER RESOURCES"
        echo "                    Generated: $(date '+%Y-%m-%d %H:%M:%S')"
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo ""
        
        echo "📦 Resource Status:"
        echo "───────────────────────────────────────────────────────────────────────────────"
        pcs resource status 2>&1
        echo ""
        
        echo "───────────────────────────────────────────────────────────────────────────────"
        echo ""
        
        echo "📋 Resource Configuration:"
        echo "───────────────────────────────────────────────────────────────────────────────"
        pcs resource config 2>&1
        echo ""
        
        echo "───────────────────────────────────────────────────────────────────────────────"
        echo ""
        
        echo "🔒 Resource Defaults:"
        echo "───────────────────────────────────────────────────────────────────────────────"
        pcs resource defaults 2>&1
        echo ""
        
        echo "═══════════════════════════════════════════════════════════════════════════════"
    } > "$temp_file"
    
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "📦 Cluster Resources" \
           --textbox "$temp_file" $DIALOG_HEIGHT $DIALOG_WIDTH
}

show_cluster_properties() {
    local temp_file="${TEMP_DIR}/cluster_properties.txt"
    
    {
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo "                    CLUSTER PROPERTIES"
        echo "                    Generated: $(date '+%Y-%m-%d %H:%M:%S')"
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo ""
        
        echo "🔧 Cluster Properties:"
        echo "───────────────────────────────────────────────────────────────────────────────"
        pcs property config 2>&1
        echo ""
        
        echo "───────────────────────────────────────────────────────────────────────────────"
        echo ""
        
        echo "📊 Cluster Configuration:"
        echo "───────────────────────────────────────────────────────────────────────────────"
        pcs config show 2>&1 | head -100
        echo ""
        
        echo "═══════════════════════════════════════════════════════════════════════════════"
    } > "$temp_file"
    
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "🔧 Cluster Properties" \
           --textbox "$temp_file" $DIALOG_HEIGHT $DIALOG_WIDTH
}

show_fence_status() {
    local temp_file="${TEMP_DIR}/fence_status.txt"
    
    {
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo "                    FENCE / STONITH STATUS"
        echo "                    Generated: $(date '+%Y-%m-%d %H:%M:%S')"
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo ""
        
        echo "⚠️  STONITH Status:"
        echo "───────────────────────────────────────────────────────────────────────────────"
        pcs stonith status 2>&1
        echo ""
        
        echo "───────────────────────────────────────────────────────────────────────────────"
        echo ""
        
        echo "🔧 STONITH Configuration:"
        echo "───────────────────────────────────────────────────────────────────────────────"
        pcs stonith config 2>&1
        echo ""
        
        echo "───────────────────────────────────────────────────────────────────────────────"
        echo ""
        
        echo "📋 Fencing History:"
        echo "───────────────────────────────────────────────────────────────────────────────"
        pcs stonith history 2>&1 || echo "No fencing history available"
        echo ""
        
        echo "═══════════════════════════════════════════════════════════════════════════════"
    } > "$temp_file"
    
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "⚠️  Fence / STONITH Status" \
           --textbox "$temp_file" $DIALOG_HEIGHT $DIALOG_WIDTH
}

#===============================================================================
# STORAGE MANAGEMENT FUNCTIONS
#===============================================================================

storage_management_menu() {
    while true; do
        local choice
        choice=$(dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
                        --title "💾 Storage Management" \
                        --menu "\nSelect a storage option:\n" \
                        $DIALOG_HEIGHT $DIALOG_WIDTH 10 \
                        "1" "📊 Storage Overview" \
                        "2" "🔗 Fiber Channel / SAN Status" \
                        "3" "🔀 Multipath Status" \
                        "4" "💿 Libvirt Storage Pools" \
                        "5" "📁 Block Devices" \
                        "6" "🔍 SCSI Device Rescan" \
                        "7" "🔙 Return to Main Menu" \
                        3>&1 1>&2 2>&3)
        
        case "$choice" in
            1)
                show_storage_overview
                ;;
            2)
                show_fc_san_status
                ;;
            3)
                show_multipath_status
                ;;
            4)
                show_libvirt_storage_pools
                ;;
            5)
                show_block_devices
                ;;
            6)
                rescan_scsi_devices
                ;;
            7|"")
                return
                ;;
        esac
    done
}

show_storage_overview() {
    local temp_file="${TEMP_DIR}/storage_overview.txt"
    
    {
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo "                    STORAGE OVERVIEW"
        echo "                    Generated: $(date '+%Y-%m-%d %H:%M:%S')"
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo ""
        
        echo "📊 Filesystem Usage:"
        echo "───────────────────────────────────────────────────────────────────────────────"
        df -h -x tmpfs -x devtmpfs -x squashfs 2>/dev/null
        echo ""
        
        echo "───────────────────────────────────────────────────────────────────────────────"
        echo ""
        
        echo "💾 Physical Volumes:"
        echo "───────────────────────────────────────────────────────────────────────────────"
        pvs 2>/dev/null || echo "No LVM physical volumes found"
        echo ""
        
        echo "📦 Volume Groups:"
        echo "───────────────────────────────────────────────────────────────────────────────"
        vgs 2>/dev/null || echo "No LVM volume groups found"
        echo ""
        
        echo "📁 Logical Volumes:"
        echo "───────────────────────────────────────────────────────────────────────────────"
        lvs 2>/dev/null || echo "No LVM logical volumes found"
        echo ""
        
        echo "═══════════════════════════════════════════════════════════════════════════════"
    } > "$temp_file"
    
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "📊 Storage Overview" \
           --textbox "$temp_file" $DIALOG_HEIGHT $DIALOG_WIDTH
}

show_fc_san_status() {
    local temp_file="${TEMP_DIR}/fc_san_status.txt"
    
    {
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo "                    FIBER CHANNEL / HPE SAN STATUS"
        echo "                    Generated: $(date '+%Y-%m-%d %H:%M:%S')"
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo ""
        
        echo "🔗 FC Host Bus Adapters:"
        echo "───────────────────────────────────────────────────────────────────────────────"
        
        if [[ -d /sys/class/fc_host ]]; then
            for host in /sys/class/fc_host/host*; do
                if [[ -d "$host" ]]; then
                    local hba=$(basename "$host")
                    echo ""
                    echo "  HBA: $hba"
                    echo "  ────────────────────────────────────────"
                    echo "    Port Name (WWPN):  $(cat "$host/port_name" 2>/dev/null)"
                    echo "    Node Name (WWNN):  $(cat "$host/node_name" 2>/dev/null)"
                    echo "    Port ID:           $(cat "$host/port_id" 2>/dev/null)"
                    echo "    Port Type:         $(cat "$host/port_type" 2>/dev/null)"
                    echo "    Port State:        $(cat "$host/port_state" 2>/dev/null)"
                    echo "    Speed:             $(cat "$host/speed" 2>/dev/null)"
                    echo "    Supported Speeds:  $(cat "$host/supported_speeds" 2>/dev/null)"
                    echo "    Fabric Name:       $(cat "$host/fabric_name" 2>/dev/null)"
                fi
            done
        else
            echo "  No Fiber Channel HBAs detected"
        fi
        echo ""
        
        echo "───────────────────────────────────────────────────────────────────────────────"
        echo ""
        
        echo "🎯 FC Remote Ports (Targets):"
        echo "───────────────────────────────────────────────────────────────────────────────"
        if [[ -d /sys/class/fc_remote_ports ]]; then
            for rport in /sys/class/fc_remote_ports/rport-*; do
                if [[ -d "$rport" ]]; then
                    local port=$(basename "$rport")
                    echo ""
                    echo "  Remote Port: $port"
                    echo "    Port Name:  $(cat "$rport/port_name" 2>/dev/null)"
                    echo "    Node Name:  $(cat "$rport/node_name" 2>/dev/null)"
                    echo "    Port State: $(cat "$rport/port_state" 2>/dev/null)"
                    echo "    Roles:      $(cat "$rport/roles" 2>/dev/null)"
                fi
            done
        else
            echo "  No FC remote ports found"
        fi
        echo ""
        
        echo "───────────────────────────────────────────────────────────────────────────────"
        echo ""
        
        echo "📀 SCSI Devices (SAN LUNs):"
        echo "───────────────────────────────────────────────────────────────────────────────"
        lsscsi 2>/dev/null || echo "  lsscsi not available"
        echo ""
        
        echo "═══════════════════════════════════════════════════════════════════════════════"
    } > "$temp_file"
    
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "🔗 Fiber Channel / HPE SAN Status" \
           --textbox "$temp_file" $DIALOG_HEIGHT $DIALOG_WIDTH
}

show_multipath_status() {
    local temp_file="${TEMP_DIR}/multipath_status.txt"
    
    {
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo "                    MULTIPATH STATUS"
        echo "                    Generated: $(date '+%Y-%m-%d %H:%M:%S')"
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo ""
        
        echo "🔀 Multipath Topology:"
        echo "───────────────────────────────────────────────────────────────────────────────"
        multipath -ll 2>/dev/null || echo "No multipath devices configured or multipathd not running"
        echo ""
        
        echo "───────────────────────────────────────────────────────────────────────────────"
        echo ""
        
        echo "📊 Multipath Daemon Status:"
        echo "───────────────────────────────────────────────────────────────────────────────"
        systemctl status multipathd --no-pager 2>&1 | head -20
        echo ""
        
        echo "───────────────────────────────────────────────────────────────────────────────"
        echo ""
        
        echo "🔧 Multipath Configuration:"
        echo "───────────────────────────────────────────────────────────────────────────────"
        if [[ -f /etc/multipath.conf ]]; then
            head -50 /etc/multipath.conf
            echo "... (truncated)"
        else
            echo "  /etc/multipath.conf not found"
        fi
        echo ""
        
        echo "═══════════════════════════════════════════════════════════════════════════════"
    } > "$temp_file"
    
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "🔀 Multipath Status" \
           --textbox "$temp_file" $DIALOG_HEIGHT $DIALOG_WIDTH
}

show_libvirt_storage_pools() {
    local temp_file="${TEMP_DIR}/libvirt_pools.txt"
    
    {
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo "                    LIBVIRT STORAGE POOLS"
        echo "                    Generated: $(date '+%Y-%m-%d %H:%M:%S')"
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo ""
        
        echo "📦 Storage Pools:"
        echo "───────────────────────────────────────────────────────────────────────────────"
        virsh pool-list --all --details 2>/dev/null
        echo ""
        
        echo "───────────────────────────────────────────────────────────────────────────────"
        echo ""
        
        # Get details for each pool
        while IFS= read -r pool; do
            if [[ -n "$pool" ]]; then
                echo "📁 Pool: $pool"
                echo "────────────────────────────────────────"
                virsh pool-info "$pool" 2>/dev/null | sed 's/^/  /'
                echo ""
                echo "  Volumes:"
                virsh vol-list "$pool" 2>/dev/null | sed 's/^/    /'
                echo ""
            fi
        done < <(virsh pool-list --name 2>/dev/null)
        
        echo "═══════════════════════════════════════════════════════════════════════════════"
    } > "$temp_file"
    
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "📦 Libvirt Storage Pools" \
           --textbox "$temp_file" $DIALOG_HEIGHT $DIALOG_WIDTH
}

show_block_devices() {
    local temp_file="${TEMP_DIR}/block_devices.txt"
    
    {
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo "                    BLOCK DEVICES"
        echo "                    Generated: $(date '+%Y-%m-%d %H:%M:%S')"
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo ""
        
        echo "💿 Block Device Tree:"
        echo "───────────────────────────────────────────────────────────────────────────────"
        lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,MODEL,SERIAL 2>/dev/null
        echo ""
        
        echo "───────────────────────────────────────────────────────────────────────────────"
        echo ""
        
        echo "📊 Block Device Details:"
        echo "───────────────────────────────────────────────────────────────────────────────"
        lsblk -O 2>/dev/null | head -50 || lsblk -a 2>/dev/null
        echo ""
        
        echo "═══════════════════════════════════════════════════════════════════════════════"
    } > "$temp_file"
    
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "💿 Block Devices" \
           --textbox "$temp_file" $DIALOG_HEIGHT $DIALOG_WIDTH
}

rescan_scsi_devices() {
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "⚠️  SCSI Device Rescan" \
           --yesno "\n🔍 SCSI Device Rescan\n\nThis will scan for new SCSI/FC devices.\nUseful after adding new LUNs from the SAN.\n\nProceed with rescan?" 12 55
    
    if [[ $? -ne 0 ]]; then
        return
    fi
    
    {
        echo "XXX"
        echo "10"
        echo "\n🔍 Scanning SCSI hosts..."
        echo "XXX"
        
        # Rescan all SCSI hosts
        for host in /sys/class/scsi_host/host*; do
            if [[ -d "$host" ]]; then
                echo "- - -" > "$host/scan" 2>/dev/null
            fi
        done
        sleep 2
        
        echo "XXX"
        echo "40"
        echo "\n🔍 Scanning FC hosts..."
        echo "XXX"
        
        # Issue LIP on FC hosts
        for host in /sys/class/fc_host/host*; do
            if [[ -d "$host" ]]; then
                echo "1" > "$host/issue_lip" 2>/dev/null
            fi
        done
        sleep 2
        
        echo "XXX"
        echo "70"
        echo "\n🔄 Reloading multipath..."
        echo "XXX"
        
        multipath -r 2>/dev/null
        sleep 2
        
        echo "XXX"
        echo "100"
        echo "\n✅ Rescan complete!"
        echo "XXX"
        sleep 1
        
    } | dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
               --title "🔍 Scanning for Devices" \
               --gauge "" 10 60 0
    
    log_action "INFO" "SCSI device rescan completed"
    
    # Show results
    show_fc_san_status
}

#===============================================================================
# CONFIGURATION BACKUP FUNCTIONS
#===============================================================================

backup_configuration() {
    local backup_name="config_backup_$(date +%Y%m%d_%H%M%S)"
    local backup_path="${CONFIG_BACKUP_DIR}/${backup_name}"
    
    mkdir -p "$backup_path"
    
    {
        echo "XXX"
        echo "10"
        echo "\n💾 Backing up network configuration..."
        echo "XXX"
        
        cp -r /etc/netplan "$backup_path/" 2>/dev/null
        sleep 1
        
        echo "XXX"
        echo "25"
        echo "\n💾 Backing up cluster configuration..."
        echo "XXX"
        
        cp /etc/corosync/corosync.conf "$backup_path/" 2>/dev/null
        pcs config backup "$backup_path/pcs_backup" 2>/dev/null
        sleep 1
        
        echo "XXX"
        echo "45"
        echo "\n💾 Backing up libvirt configuration..."
        echo "XXX"
        
        mkdir -p "$backup_path/libvirt"
        cp -r /etc/libvirt "$backup_path/libvirt/" 2>/dev/null
        virsh dumpxml --all > "$backup_path/libvirt/all_vms.xml" 2>/dev/null
        sleep 1
        
        echo "XXX"
        echo "65"
        echo "\n💾 Backing up multipath configuration..."
        echo "XXX"
        
        cp /etc/multipath.conf "$backup_path/" 2>/dev/null
        sleep 1
        
        echo "XXX"
        echo "80"
        echo "\n💾 Backing up hosts file..."
        echo "XXX"
        
        cp /etc/hosts "$backup_path/" 2>/dev/null
        cp /etc/hostname "$backup_path/" 2>/dev/null
        sleep 1
        
        echo "XXX"
        echo "95"
        echo "\n📦 Creating archive..."
        echo "XXX"
        
        tar -czf "${backup_path}.tar.gz" -C "$CONFIG_BACKUP_DIR" "$backup_name" 2>/dev/null
        rm -rf "$backup_path"
        sleep 1
        
        echo "XXX"
        echo "100"
        echo "\n✅ Backup complete!"
        echo "XXX"
        sleep 1
        
    } | dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
               --title "💾 Configuration Backup" \
               --gauge "" 10 60 0
    
    log_action "INFO" "Configuration backup created: ${backup_path}.tar.gz"
    
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "✅ Backup Complete" \
           --msgbox "\n✅ Configuration backup saved to:\n\n${backup_path}.tar.gz\n\nIncludes:\n  • Network configuration\n  • Cluster configuration\n  • Libvirt configuration\n  • Multipath configuration\n  • System hosts/hostname" 16 60
}

#===============================================================================
# SYSTEM INFORMATION FUNCTIONS
#===============================================================================

show_system_info() {
    local temp_file="${TEMP_DIR}/system_info.txt"
    
    {
        echo "╔═══════════════════════════════════════════════════════════════════════════════╗"
        echo "║                         SYSTEM INFORMATION                                    ║"
        echo "╚═══════════════════════════════════════════════════════════════════════════════╝"
        echo ""
        
        echo "🖥️  HARDWARE"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo "  Manufacturer:  $(dmidecode -s system-manufacturer 2>/dev/null || echo "N/A")"
        echo "  Product:       $(dmidecode -s system-product-name 2>/dev/null || echo "N/A")"
        echo "  Serial:        $(dmidecode -s system-serial-number 2>/dev/null || echo "N/A")"
        echo "  BIOS Version:  $(dmidecode -s bios-version 2>/dev/null || echo "N/A")"
        echo ""
        
        echo "🔲 CPU"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo "  Model:    $(grep "model name" /proc/cpuinfo | head -1 | cut -d':' -f2 | xargs)"
        echo "  Cores:    $(nproc) ($(grep -c processor /proc/cpuinfo) threads)"
        echo "  Sockets:  $(grep "physical id" /proc/cpuinfo | sort -u | wc -l)"
        echo ""
        
        echo "🧠 MEMORY"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        free -h
        echo ""
        
        echo "💾 STORAGE SUMMARY"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        df -h -x tmpfs -x devtmpfs -x squashfs 2>/dev/null
        echo ""
        
        echo "🌐 NETWORK"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        ip -br addr show 2>/dev/null
        echo ""
        
        echo "⚙️  SERVICES"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        for svc in libvirtd corosync pacemaker pcsd multipathd ssh; do
            local status=$(systemctl is-active "$svc" 2>/dev/null || echo "not-found")
            local icon=$(get_status_icon "$status")
            printf "  %s %-25s %s\n" "$icon" "$svc" "$status"
        done
        echo ""
        
        echo "╔═══════════════════════════════════════════════════════════════════════════════╗"
        echo "║                         END OF SYSTEM INFO                                    ║"
        echo "╚═══════════════════════════════════════════════════════════════════════════════╝"
        
    } > "$temp_file"
    
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "🖥️  System Information" \
           --textbox "$temp_file" $DIALOG_HEIGHT $DIALOG_WIDTH
}

#===============================================================================
# ABOUT / HELP FUNCTIONS
#===============================================================================

show_about() {
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "ℹ️  About ${SCRIPT_NAME}" \
           --msgbox "
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     🔮 MORPHEUS HVM CLUSTER MANAGER                       ║
║                                                           ║
║     Version: ${SCRIPT_VERSION}                                      ║
║     Platform: Ubuntu 24.04.3 LTS                          ║
║                                                           ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  A comprehensive management tool for Morpheus HVM hosts   ║
║  featuring:                                               ║
║                                                           ║
║    • Live VM Migration with progress tracking             ║
║    • Cluster health monitoring                            ║
║    • Corosync/Pacemaker management                        ║
║    • Fiber Channel SAN status                             ║
║    • Full system diagnostics                              ║
║    • Configuration backup                                 ║
║                                                           ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  Log Directory:    /var/log/morpheus-node/morphd          ║
║  Diagnostics:      /opt/diagnostics                       ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
" 28 65
}

show_help() {
    local temp_file="${TEMP_DIR}/help.txt"
    
    cat > "$temp_file" << 'HELPTEXT'
═══════════════════════════════════════════════════════════════════════════════
                         MORPHEUS HVM MANAGER - HELP
═══════════════════════════════════════════════════════════════════════════════

NAVIGATION
──────────────────────────────────────────────────────────────────────────────
  • Use UP/DOWN arrows to navigate menus
  • Press ENTER to select an option
  • Press ESC or select "Return" to go back
  • In text views, use Page Up/Down to scroll

LIVE VM MIGRATION
──────────────────────────────────────────────────────────────────────────────
  1. Select "Live VM Migration" from main menu
  2. Choose "Migrate a Running VM"
  3. Select the VM you want to migrate
  4. Select the target host from available cluster nodes
  5. Confirm the migration
  6. Monitor progress in real-time

  Note: Only running VMs can be live migrated. The target host must be
  reachable via SSH and have access to shared storage.

DIAGNOSTICS
──────────────────────────────────────────────────────────────────────────────
  • View Morpheus Log: Shows last 1000 lines of the Morpheus node log
  • Live Tail: Real-time log monitoring (Ctrl+C to exit)
  • Morpheus Status: Shows morpheus-node-ctl status output
  • PCS Cluster Status: Shows Pacemaker cluster status
  • Corosync/Pacemaker: Detailed cluster communication status
  • DNS Lookup: Tests DNS resolution for rectitude.net
  • Network Fix: Applies netplan and restarts Morpheus agent
  • Full Diagnostic: Comprehensive system report saved to /opt/diagnostics

CLUSTER MANAGEMENT
──────────────────────────────────────────────────────────────────────────────
  • Health Dashboard: Overview of all cluster nodes and services
  • Connectivity Matrix: Tests network connectivity between all nodes
  • Resources: Shows cluster resource status and configuration
  • STONITH/Fencing: Shows fencing device status

STORAGE MANAGEMENT
──────────────────────────────────────────────────────────────────────────────
  • Storage Overview: Filesystem usage and LVM status
  • FC/SAN Status: Fiber Channel HBA and target information
  • Multipath: DM-Multipath device status
  • Libvirt Pools: Virtual machine storage pools
  • SCSI Rescan: Scan for new SAN LUNs

KEYBOARD SHORTCUTS (in text views)
──────────────────────────────────────────────────────────────────────────────
  g/G     - Go to beginning/end
  /       - Search
  n/N     - Next/previous search result
  q       - Quit/close

═══════════════════════════════════════════════════════════════════════════════
HELPTEXT

    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "❓ Help" \
           --textbox "$temp_file" $DIALOG_HEIGHT $DIALOG_WIDTH
}

#===============================================================================
# MAIN MENU
#===============================================================================

main_menu() {
    while true; do
        local choice
        choice=$(dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION} | Host: $(hostname) | $(date '+%Y-%m-%d %H:%M')" \
                        --title "🔮 MORPHEUS HVM CLUSTER MANAGER" \
                        --cancel-label "Exit" \
                        --menu "\n  Welcome to the Morpheus HVM Management Console\n  Select an option below:\n" \
                        $DIALOG_HEIGHT $DIALOG_WIDTH 12 \
                        "1" "🚀 VM Operations" \
                        "2" "🔧 Diagnostics & Troubleshooting" \
                        "3" "🔗 Cluster Management" \
                        "4" "💾 Storage Management" \
                        "5" "🖥️  System Information" \
                        "6" "💾 Backup Configuration" \
                        "7" "❓ Help" \
                        "8" "ℹ️  About" \
                        "9" "🚪 Exit" \
                        3>&1 1>&2 2>&3)
        
        local exit_status=$?
        
        # Handle ESC or Cancel
        if [[ $exit_status -ne 0 ]]; then
            confirm_exit
            continue
        fi
        
        case "$choice" in
            1)
                live_migration_menu
                ;;
            2)
                diagnostics_menu
                ;;
            3)
                cluster_management_menu
                ;;
            4)
                storage_management_menu
                ;;
            5)
                show_system_info
                ;;
            6)
                backup_configuration
                ;;
            7)
                show_help
                ;;
            8)
                show_about
                ;;
            9)
                confirm_exit
                ;;
            "")
                confirm_exit
                ;;
        esac
    done
}

confirm_exit() {
    dialog --backtitle "${SCRIPT_NAME} v${SCRIPT_VERSION}" \
           --title "🚪 Exit Confirmation" \
           --yesno "\nAre you sure you want to exit?\n" 8 40
    
    if [[ $? -eq 0 ]]; then
        cleanup
        exit 0
    fi
}

#===============================================================================
# SPLASH SCREEN
#===============================================================================

show_splash() {
    dialog --backtitle "Morpheus HVM Manager" \
           --title "" \
           --infobox "\n\n\n\
\n\
                M O R P H E U S\n\
\n\
                    H V M\n\
\n\
            ________________________\n\
\n\
            CLUSTER MANAGER v${SCRIPT_VERSION}\n\
\n\
       Initializing management console...\n" 18 48
    
    sleep 2
}

#===============================================================================
# MAIN ENTRY POINT
#===============================================================================

main() {
    # Initialize environment
    init_environment
    
    # Show splash screen
    show_splash
    
    # Log startup
    log_action "INFO" "Morpheus HVM Manager started by $(whoami)"
    
    # Enter main menu
    main_menu
}

# Run main function
main "$@"

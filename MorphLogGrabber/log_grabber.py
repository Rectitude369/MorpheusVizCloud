import customtkinter as ctk
import paramiko
import threading
import os
import time
import sys
import socket

# Set appearance mode and default color theme
ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("blue")

class LogGrabberApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        # Window setup
        self.title("HPE/Morpheus Log Collector")
        self.geometry("900x600")
        
        # Grid configuration
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)

        # Sidebar Frame (Inputs)
        self.sidebar_frame = ctk.CTkFrame(self, width=250, corner_radius=0)
        self.sidebar_frame.grid(row=0, column=0, sticky="nsew")
        self.sidebar_frame.grid_rowconfigure(7, weight=1)

        self.logo_label = ctk.CTkLabel(self.sidebar_frame, text="Log Grabber", font=ctk.CTkFont(size=20, weight="bold"))
        self.logo_label.grid(row=0, column=0, padx=20, pady=(20, 10))

        # Credentials
        self.creds_label = ctk.CTkLabel(self.sidebar_frame, text="SSH Credentials", font=ctk.CTkFont(size=14, weight="bold"))
        self.creds_label.grid(row=1, column=0, padx=20, pady=(10, 0), sticky="w")

        self.username_entry = ctk.CTkEntry(self.sidebar_frame, placeholder_text="Username")
        self.username_entry.grid(row=2, column=0, padx=20, pady=(5, 5), sticky="ew")

        self.password_entry = ctk.CTkEntry(self.sidebar_frame, placeholder_text="Password", show="*")
        self.password_entry.grid(row=3, column=0, padx=20, pady=(5, 10), sticky="ew")

        # Hosts Input
        self.hosts_label = ctk.CTkLabel(self.sidebar_frame, text="Target Hosts (IP/Hostname)", font=ctk.CTkFont(size=14, weight="bold"))
        self.hosts_label.grid(row=4, column=0, padx=20, pady=(10, 0), sticky="w")
        
        self.hosts_helper_label = ctk.CTkLabel(self.sidebar_frame, text="One per line", font=ctk.CTkFont(size=12))
        self.hosts_helper_label.grid(row=5, column=0, padx=20, pady=(0, 5), sticky="w")

        self.hosts_textbox = ctk.CTkTextbox(self.sidebar_frame, height=200)
        self.hosts_textbox.grid(row=6, column=0, padx=20, pady=(0, 10), sticky="nsew")

        # Action Button
        self.collect_button = ctk.CTkButton(self.sidebar_frame, text="Start Collection", command=self.start_collection_thread)
        self.collect_button.grid(row=8, column=0, padx=20, pady=20)

        # Main Content Frame (Logs)
        self.main_frame = ctk.CTkFrame(self, corner_radius=0)
        self.main_frame.grid(row=0, column=1, sticky="nsew")
        self.main_frame.grid_columnconfigure(0, weight=1)
        self.main_frame.grid_rowconfigure(1, weight=1)

        self.console_label = ctk.CTkLabel(self.main_frame, text="Process Log", font=ctk.CTkFont(size=16, weight="bold"))
        self.console_label.grid(row=0, column=0, padx=20, pady=(20, 10), sticky="w")

        self.console_textbox = ctk.CTkTextbox(self.main_frame, font=ctk.CTkFont(family="Consolas", size=12))
        self.console_textbox.grid(row=1, column=0, padx=20, pady=(0, 20), sticky="nsew")
        self.console_textbox.configure(state="disabled")

        # Ensure Logs directory exists
        self.base_dir = os.getcwd()
        self.logs_dir = os.path.join(self.base_dir, "Logs_Received")
        if not os.path.exists(self.logs_dir):
            os.makedirs(self.logs_dir)

    def log(self, message):
        self.console_textbox.configure(state="normal")
        self.console_textbox.insert("end", message + "\n")
        self.console_textbox.see("end")
        self.console_textbox.configure(state="disabled")

    def start_collection_thread(self):
        self.collect_button.configure(state="disabled", text="Running...")
        thread = threading.Thread(target=self.process_hosts)
        thread.daemon = True
        thread.start()

    def process_hosts(self):
        username = self.username_entry.get().strip()
        password = self.password_entry.get().strip()
        hosts_raw = self.hosts_textbox.get("1.0", "end").strip()
        
        if not username or not password:
            self.log("[ERROR] Username and Password are required.")
            self.collect_button.configure(state="normal", text="Start Collection")
            return

        if not hosts_raw:
            self.log("[ERROR] No hosts provided.")
            self.collect_button.configure(state="normal", text="Start Collection")
            return

        hosts = [h.strip() for h in hosts_raw.splitlines() if h.strip()]
        
        local_script = os.path.join(self.base_dir, "collect.sh")
        if not os.path.exists(local_script):
            self.log(f"[ERROR] 'collect.sh' not found in {self.base_dir}")
            self.collect_button.configure(state="normal", text="Start Collection")
            return

        self.log(f"Starting collection on {len(hosts)} hosts...")
        self.log(f"Logs will be saved to: {self.logs_dir}")

        for host in hosts:
            self.process_single_host(host, username, password, local_script)

        self.log("\nAll tasks completed.")
        self.collect_button.configure(state="normal", text="Start Collection")

    def process_single_host(self, host, username, password, local_script):
        self.log(f"\n[{host}] Connecting...")
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        try:
            ssh.connect(host, username=username, password=password, timeout=10)
            self.log(f"[{host}] Connected via SSH.")
            
            # SCP Upload
            sftp = ssh.open_sftp()
            remote_script = "/tmp/collect.sh"
            self.log(f"[{host}] Uploading collect.sh...")
            sftp.put(local_script, remote_script)
            sftp.chmod(remote_script, 0o755)
            sftp.close()
            
            # Execute with PTY to handle prompts
            self.log(f"[{host}] Running collection script (this may take 5-10 mins)...")
            
            # We use invoke_shell to handle interactive prompts better than exec_command in some cases,
            # but exec_command(get_pty=True) is usually sufficient and easier to manage exit codes.
            # We cd to /tmp so the script generates the tar.gz in /tmp, making it easy to find.
            stdin, stdout, stderr = ssh.exec_command("cd /tmp && ./collect.sh", get_pty=True)
            
            output_buffer = ""
            tar_filename = None
            
            # Monitor output
            while not stdout.channel.exit_status_ready():
                if stdout.channel.recv_ready():
                    chunk = stdout.channel.recv(1024).decode('utf-8', errors='ignore')
                    output_buffer += chunk
                    # Print to console (optional, maybe too noisy, just print status)
                    # self.log(chunk.strip()) 
                    
                    # Handle Prompts
                    if "Enter your choice (1 or 2):" in chunk or "Enter your choice (1 or 2):" in output_buffer[-100:]:
                        self.log(f"[{host}] Handling 'Multiple logs' prompt -> Sending '1' (Cleanup)")
                        stdin.write("1\n")
                        stdin.flush()
                        output_buffer = "" # Clear buffer to avoid re-matching
                        
                    if "Collecting SOS report..." in chunk or "Collecting SOS report..." in output_buffer[-200:]:
                        # The prompt might wait for ENTER.
                        # We wait a bit to ensure it's actually waiting, but sending \n safely is fine.
                        # The script says: "Collecting SOS report..." then runs sos report. 
                        # If sos report itself prompts, that's different.
                        # User said: "gets to a point the script says 'Collecting SOS report...' which requires hitting ENTER"
                        self.log(f"[{host}] Handling 'Collecting SOS report' prompt -> Sending ENTER")
                        stdin.write("\n")
                        stdin.flush()
                        # Also wait 30s and check if stuck? 
                        # Implementing a simple timeout check would be complex here without a non-blocking read loop.
                        # We will assume \n works.
                        output_buffer = ""

                time.sleep(0.5)

            # Flush remaining output
            rest = stdout.read().decode('utf-8', errors='ignore')
            output_buffer += rest
            
            # Parse output for filename
            # Looking for: "Output archive created: collect_atl-morph_20251219_174821.tar.gz"
            for line in output_buffer.splitlines() + rest.splitlines():
                if "Output archive created:" in line:
                    parts = line.split(":")
                    if len(parts) > 1:
                        tar_filename = parts[1].strip()
                        self.log(f"[{host}] Identified log file: {tar_filename}")
            
            exit_status = stdout.channel.recv_exit_status()
            
            if exit_status == 0 and tar_filename:
                # Download
                sftp = ssh.open_sftp()
                remote_path = f"/tmp/{tar_filename}" # Assuming script ran in /tmp and output there
                # Wait, script says OUTPUT_DIR="$(pwd)/..." so if we ran in /tmp, it is in /tmp.
                
                local_path = os.path.join(self.logs_dir, tar_filename)
                self.log(f"[{host}] Downloading {tar_filename}...")
                
                try:
                    sftp.get(remote_path, local_path)
                    self.log(f"[{host}] Download complete: {local_path}")
                    
                    # Cleanup remote
                    self.log(f"[{host}] Cleaning up remote files...")
                    ssh.exec_command(f"rm -f /tmp/collect.sh {remote_path}")
                    
                except Exception as e:
                    self.log(f"[{host}] Download failed: {str(e)}")
                
                sftp.close()
            else:
                self.log(f"[{host}] Collection failed or no filename found. Exit code: {exit_status}")
                # Debug output if failed
                # self.log(f"[{host}] Output dump: {output_buffer}")

        except Exception as e:
            self.log(f"[{host}] Error: {str(e)}")
        finally:
            ssh.close()

if __name__ == "__main__":
    app = LogGrabberApp()
    app.mainloop()

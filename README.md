# Wake-on-LAN for UmbrelOS

A clean, self-hosted Wake-on-LAN manager that runs on your Umbrel home server.

## Project Structure

```
wol-app/
├── backend/
│   ├── package.json
│   └── server.js          # Express API server
├── frontend/
│   └── index.html         # Single-page app UI
├── Dockerfile
├── docker-compose.yml
├── umbrel-app.yml         # UmbrelOS app manifest
└── README.md
```

## Features

- 📡 **ARP scan** — discovers devices already on your LAN
- 💾 **Persistent storage** — saved devices survive container restarts
- ⚡ **One-click wake** — sends UDP broadcast magic packets
- 🟢 **Live status** — polls device online state after waking
- 🖥️ **Clean UI** — dark, minimal design that fits Umbrel's aesthetic

---

## Installing on UmbrelOS

### Method 1 — Community App Store (recommended)

UmbrelOS supports custom app repositories. You can add this app by pointing
Umbrel at a Git repository that contains the app manifest.

1. **Fork / host the repo**  
   Push this folder to a public GitHub repository, e.g.  
   `https://github.com/YOUR_USERNAME/umbrel-wol-app`

2. **Create the app-store index**  
   The repo root needs an `apps/` directory where each app lives in its own
   subfolder. Example layout:
   ```
   umbrel-app-store/
   └── apps/
       └── wol-app/
           ├── umbrel-app.yml
           ├── docker-compose.yml
           └── ...
   ```
   Add an `umbrel-app-store.yml` at the root:
   ```yaml
   id: my-app-store
   name: My App Store
   ```

3. **Add the store to Umbrel**
   - Open your Umbrel dashboard → **App Store**
   - Click the ⚙️ settings icon (top-right)
   - Choose **Add Community App Store**
   - Paste your GitHub repo URL and click **Add**

4. **Install the app**  
   Find "Wake-on-LAN" in the Community section and click **Install**.

---

### Method 2 — Manual SSH install (fastest for testing)

SSH into your Umbrel server and run:

```bash
# 1. SSH into Umbrel
ssh umbrel@umbrel.local
# Password: your Umbrel password

# 2. Navigate to the apps directory
cd ~/umbrel/apps

# 3. Create the app folder and copy files
mkdir wol-app && cd wol-app

# 4. Clone or SCP your project files here, then build:
docker compose build

# 5. Register with Umbrel
~/umbrel/scripts/app install wol-app

# OR start manually (without Umbrel app management):
docker compose up -d
```

After starting, the app is available at:
```
http://umbrel.local:3000
```

---

### Method 3 — Docker Compose standalone

If you just want to run it without Umbrel's app framework:

```bash
git clone https://github.com/YOUR_USERNAME/umbrel-wol-app
cd umbrel-wol-app
docker compose up -d --build
```

Open http://YOUR_SERVER_IP:3000 in your browser.

---

## Prerequisites on the Windows PC (Target Device)

For WoL to work, the target PC must have WoL enabled:

1. **BIOS/UEFI** — Enable "Wake on LAN" or "Power On By PCI-E" in firmware settings
2. **Network adapter** — In Device Manager → Network Adapter → Properties → Power Management:
   - ✅ Allow this device to wake the computer
   - ✅ Only allow a magic packet to wake the computer
3. **Fast Startup** — Disable Windows Fast Startup (Control Panel → Power Options → Choose what the power buttons do → uncheck "Turn on fast startup")
4. **Static IP / DHCP reservation** — Optional but recommended so the IP doesn't change

---

## Notes

- The container uses `network_mode: host` — this is required so it can read the host's ARP table and send UDP broadcast packets on the local network.
- Devices are stored in `./data/devices.json` on the host.
- The status check uses `ping` — if your firewall blocks ICMP, the indicator may show "Offline" even when the machine is on.
- WoL only works on the **local network** (same subnet). It does not work over the internet without router port-forwarding port 9 UDP.

const express = require("express");
const cors = require("cors");
const wol = require("wol");
const fs = require("fs");
const path = require("path");
const { execSync, exec } = require("child_process");

const app = express();
const PORT = 3000;
const DATA_FILE = "/data/devices.json";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

// ── Helpers ─────────────────────────────────────────────────────────────────

function loadDevices() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (e) {
    console.error("Failed to load devices:", e.message);
  }
  return [];
}

function saveDevices(devices) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(devices, null, 2));
  } catch (e) {
    console.error("Failed to save devices:", e.message);
  }
}

function normalizeMac(mac) {
  return mac
    .replace(/[^a-fA-F0-9]/g, "")
    .toUpperCase()
    .match(/.{1,2}/g)
    .join(":");
}

function isValidMac(mac) {
  return /^([0-9A-Fa-f]{2}[:\-]){5}([0-9A-Fa-f]{2})$/.test(mac);
}

// Ping a host, returns true if reachable
function pingHost(ip) {
  return new Promise((resolve) => {
    if (!ip) return resolve(false);
    exec(
      `ping -c 1 -W 1 ${ip}`,
      { timeout: 3000 },
      (error) => resolve(!error)
    );
  });
}

// Read ARP table from /proc/net/arp (Linux)
function readArpTable() {
  try {
    const raw = fs.readFileSync("/proc/net/arp", "utf8");
    const lines = raw.trim().split("\n").slice(1); // skip header
    return lines
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        // ip, hwtype, flags, mac, mask, device
        if (parts.length < 6) return null;
        const ip = parts[0];
        const mac = parts[3];
        const iface = parts[5];
        if (!mac || mac === "00:00:00:00:00:00") return null;
        return { ip, mac: mac.toUpperCase(), iface };
      })
      .filter(Boolean);
  } catch (e) {
    console.error("ARP read failed:", e.message);
    return [];
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /api/devices — list saved devices with live online status
app.get("/api/devices", async (req, res) => {
  const devices = loadDevices();
  const arpTable = readArpTable();

  // Enrich devices: update IP from ARP if found, check online status
  const enriched = await Promise.all(
    devices.map(async (dev) => {
      // Try to find current IP via ARP
      const arpEntry = arpTable.find(
        (a) => a.mac.toUpperCase() === dev.mac.toUpperCase()
      );
      const currentIp = (arpEntry && arpEntry.ip) || dev.ip || null;
      const online = await pingHost(currentIp);
      return { ...dev, ip: currentIp, online };
    })
  );

  res.json(enriched);
});

// GET /api/scan — scan ARP table for unknown devices on the network
app.get("/api/scan", async (req, res) => {
  // Trigger ARP population by pinging the broadcast (best-effort)
  try {
    execSync("ping -c 1 -b 255.255.255.255 2>/dev/null || true", {
      timeout: 2000,
    });
  } catch (_) {}

  const arpTable = readArpTable();
  const devices = loadDevices();
  const knownMacs = new Set(devices.map((d) => d.mac.toUpperCase()));

  const unknown = arpTable
    .filter((a) => !knownMacs.has(a.mac.toUpperCase()))
    .map((a) => ({ ip: a.ip, mac: a.mac, iface: a.iface }));

  res.json(unknown);
});

// POST /api/devices — add or update a device
app.post("/api/devices", (req, res) => {
  const { name, mac, ip } = req.body;
  if (!name || !mac) {
    return res.status(400).json({ error: "name and mac are required" });
  }

  let normalizedMac;
  try {
    normalizedMac = normalizeMac(mac);
    if (!isValidMac(normalizedMac)) throw new Error("invalid");
  } catch {
    return res.status(400).json({ error: "Invalid MAC address" });
  }

  const devices = loadDevices();
  const existing = devices.findIndex(
    (d) => d.mac.toUpperCase() === normalizedMac.toUpperCase()
  );

  const device = {
    id: normalizedMac,
    name: name.trim(),
    mac: normalizedMac,
    ip: ip || null,
    addedAt: existing >= 0 ? devices[existing].addedAt : new Date().toISOString(),
  };

  if (existing >= 0) {
    devices[existing] = device;
  } else {
    devices.push(device);
  }

  saveDevices(devices);
  res.json(device);
});

// DELETE /api/devices/:mac — remove a device
app.delete("/api/devices/:mac", (req, res) => {
  let mac;
  try {
    mac = normalizeMac(req.params.mac);
  } catch {
    return res.status(400).json({ error: "Invalid MAC" });
  }

  let devices = loadDevices();
  const before = devices.length;
  devices = devices.filter(
    (d) => d.mac.toUpperCase() !== mac.toUpperCase()
  );

  if (devices.length === before) {
    return res.status(404).json({ error: "Device not found" });
  }

  saveDevices(devices);
  res.json({ ok: true });
});

// POST /api/wake — send WoL magic packet
app.post("/api/wake", (req, res) => {
  const { mac, ip } = req.body;
  if (!mac) return res.status(400).json({ error: "mac is required" });

  let normalizedMac;
  try {
    normalizedMac = normalizeMac(mac);
  } catch {
    return res.status(400).json({ error: "Invalid MAC address" });
  }

  const opts = { address: ip || "255.255.255.255", port: 9 };

  wol.wake(normalizedMac, opts, (err) => {
    if (err) {
      console.error("WoL error:", err);
      return res.status(500).json({ error: "Failed to send magic packet" });
    }
    console.log(`Magic packet sent → ${normalizedMac} (broadcast: ${opts.address})`);
    res.json({ ok: true, mac: normalizedMac, sentAt: new Date().toISOString() });
  });
});

// GET /api/status/:mac — quick online check for a single device
app.get("/api/status/:mac", async (req, res) => {
  let mac;
  try {
    mac = normalizeMac(req.params.mac);
  } catch {
    return res.status(400).json({ error: "Invalid MAC" });
  }

  const devices = loadDevices();
  const device = devices.find(
    (d) => d.mac.toUpperCase() === mac.toUpperCase()
  );

  const arpTable = readArpTable();
  const arpEntry = arpTable.find(
    (a) => a.mac.toUpperCase() === mac.toUpperCase()
  );
  const ip = (arpEntry && arpEntry.ip) || (device && device.ip) || null;
  const online = await pingHost(ip);

  res.json({ mac, ip, online });
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`WoL server running on port ${PORT}`);
});

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SPREADSHEET_ID = "1hne3vp8EQtLIqdGgGDKFm2I9nr2PlICHBy0dgj4lZsE";
const SHEET_NAME = "Rooms";
const SHEETS_API = "https://sheets.googleapis.com/v4";

// Status values that exist in the sheet's Selection tab + one transient state we add
export const STATUSES = [
  "Gotowe",
  "Wolne / do sprzątnięcia",
  "Priorytet / do sprzątnięcia",
  "Zajęte",
  "Sprzątanie w toku",
] as const;
export type RoomStatus = (typeof STATUSES)[number];

export type Room = {
  row: number;
  roomId: string;
  roomName: string;
  floor: string;
  status: string;
  timeStamp: string;
  cleanerName: string;
  startTime: string;
  endTime: string;
  totalTime: string;
  notes: string;
};

// ---------- Google service-account auth (JWT -> access token) ----------

let cachedToken: { token: string; expiresAt: number } | null = null;

function base64UrlEncode(input: ArrayBuffer | string): string {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : new Uint8Array(input);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const cleaned = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  if (!cleaned) throw new Error("Private key body is empty after stripping PEM headers");
  let binary: string;
  try {
    binary = atob(cleaned);
  } catch {
    throw new Error("Private key is not valid base64 — check that the secret contains the full PEM with \\n newlines");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!clientEmail) throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL is not configured");
  if (!rawKey) throw new Error("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is not configured");

  // Secrets often store PEMs with literal "\n" and/or surrounding quotes —
  // normalise to real newlines and strip wrapping quotes.
  let privateKeyPem = rawKey.trim();
  if (
    (privateKeyPem.startsWith('"') && privateKeyPem.endsWith('"')) ||
    (privateKeyPem.startsWith("'") && privateKeyPem.endsWith("'"))
  ) {
    privateKeyPem = privateKeyPem.slice(1, -1);
  }
  privateKeyPem = privateKeyPem.replace(/\\n/g, "\n").replace(/\\r/g, "");

  if (!privateKeyPem.includes("BEGIN PRIVATE KEY")) {
    if (privateKeyPem.includes("BEGIN RSA PRIVATE KEY")) {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is in PKCS#1 format (BEGIN RSA PRIVATE KEY). Google service account keys are PKCS#8 (BEGIN PRIVATE KEY) — re-download the JSON key from Google Cloud and copy the `private_key` field verbatim.",
      );
    }
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY does not look like a PEM private key. Paste the full `private_key` value from the service account JSON, including the BEGIN/END lines.",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(payload),
  )}`;

  const keyData = pemToArrayBuffer(privateKeyPem);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${base64UrlEncode(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    throw new Error(`Google token exchange failed [${res.status}]: ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

async function authHeaders() {
  const token = await getAccessToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// ---------- Time helpers ----------

function nowWarsaw(): { stamp: string; date: Date } {
  const date = new Date();
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const stamp = `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
  return { stamp, date };
}

function diffHHMM(startStamp: string, endStamp: string): string {
  const toDate = (s: string) => {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  };
  const a = toDate(startStamp);
  const b = toDate(endStamp);
  if (!a || !b) return "";
  const mins = Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ---------- Sheets I/O ----------

async function readRows(): Promise<Room[]> {
  const range = `${SHEET_NAME}!A2:I100`;
  const url = `${SHEETS_API}/spreadsheets/${SPREADSHEET_ID}/values/${range}`;
  const res = await fetch(url, { headers: await authHeaders(), cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Sheets read failed [${res.status}]: ${await res.text()}`);
  }
  const data = (await res.json()) as { values?: string[][] };
  const rows = data.values ?? [];
  return rows
    .map((r, i) => {
      const cells = [...r];
      while (cells.length < 9) cells.push("");
      return {
        row: i + 2,
        roomId: cells[0],
        roomName: cells[1],
        floor: "",
        status: cells[2],
        timeStamp: cells[3],
        cleanerName: cells[4],
        startTime: cells[5],
        endTime: cells[6],
        totalTime: cells[7],
        notes: cells[8],
      } satisfies Room;
    })
    .filter((r) => r.roomName.trim() !== "");
}

async function writeRange(range: string, values: (string | number)[][]) {
  const url = `${SHEETS_API}/spreadsheets/${SPREADSHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: "PUT",
    headers: await authHeaders(),
    body: JSON.stringify({ range, majorDimension: "ROWS", values }),
  });
  if (!res.ok) {
    throw new Error(`Sheets write failed [${res.status}]: ${await res.text()}`);
  }
}

// ---------- Server functions ----------

export const getRooms = createServerFn({ method: "GET" }).handler(async () => {
  const rooms = await readRows();
  return { rooms };
});

export const clockIn = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        row: z.number().int().min(2).max(200),
        cleanerName: z.string().trim().min(1).max(80),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { stamp } = nowWarsaw();
    await writeRange(`${SHEET_NAME}!C${data.row}:G${data.row}`, [
      ["Sprzątanie w toku", stamp, data.cleanerName, stamp, ""],
    ]);
    return { ok: true };
  });

export const clockOut = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ row: z.number().int().min(2).max(200) }).parse(data),
  )
  .handler(async ({ data }) => {
    const rooms = await readRows();
    const room = rooms.find((r) => r.row === data.row);
    if (!room) throw new Error("Room not found");
    const { stamp } = nowWarsaw();
    const totalTime = diffHHMM(room.startTime, stamp);
    await writeRange(`${SHEET_NAME}!C${data.row}:H${data.row}`, [
      ["Gotowe", stamp, room.cleanerName, room.startTime, stamp, totalTime],
    ]);
    return { ok: true };
  });

export const setRoomStatus = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        row: z.number().int().min(2).max(200),
        status: z.enum(STATUSES),
        pin: z.string().min(1).max(32),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const expected = process.env.OWNER_PIN;
    if (!expected) throw new Error("OWNER_PIN not configured");
    if (data.pin !== expected) throw new Error("Invalid PIN");
    const { stamp } = nowWarsaw();
    await writeRange(`${SHEET_NAME}!C${data.row}:H${data.row}`, [
      [data.status, stamp, "", "", "", ""],
    ]);
    return { ok: true };
  });

export const verifyOwnerPin = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ pin: z.string().min(1).max(32) }).parse(data))
  .handler(async ({ data }) => {
    const expected = process.env.OWNER_PIN;
    if (!expected) throw new Error("OWNER_PIN not configured");
    return { ok: data.pin === expected };
  });

export const setRoomNotes = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        row: z.number().int().min(2).max(200),
        notes: z.string().max(2000),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await writeRange(`${SHEET_NAME}!I${data.row}`, [[data.notes]]);
    return { ok: true };
  });

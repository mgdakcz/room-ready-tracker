import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SPREADSHEET_ID = "1hne3vp8EQtLIqdGgGDKFm2I9nr2PlICHBy0dgj4lZsE";
const SHEET_NAME = "Rooms";
const GATEWAY = "https://sheets.googleapis.com/v4";

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
  row: number; // 1-based sheet row, >= 2
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

// Returns standard JSON content headers for public Google API requests
function getGoogleRequestHeaders() {
  return {
    "Content-Type": "application/json",
  };
}

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

async function readRows(): Promise<Room[]> {
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY || "";
  if (!apiKey) throw new Error("GOOGLE_SHEETS_API_KEY is not configured");

  const range = `${SHEET_NAME}!A2:I100`;
  const url = `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${range}?key=${apiKey}`;

  const res = await fetch(url, {
    headers: getGoogleRequestHeaders(),
    cache: "no-store",
  });
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
  const url = process.env.APPS_SCRIPT_URL || "";
  const token = process.env.APPS_SCRIPT_TOKEN || "";
  if (!url) throw new Error("APPS_SCRIPT_URL is not configured");
  if (!token) throw new Error("APPS_SCRIPT_TOKEN is not configured");

  // The range arrives as "Rooms!C5:G5"; Apps Script wants the sheet name
  // and the A1 range separately.
  const bang = range.indexOf("!");
  const sheetName = bang >= 0 ? range.slice(0, bang) : SHEET_NAME;
  const a1 = bang >= 0 ? range.slice(bang + 1) : range;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      spreadsheetId: SPREADSHEET_ID,
      sheetName,
      range: a1,
      values,
    }),
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Sheets write failed [${res.status}]: ${await res.text()}`);
  }
  const json = (await res.json()) as { ok?: boolean; error?: string };
  if (!json.ok) {
    throw new Error(`Sheets write failed: ${json.error ?? "unknown error"}`);
  }
}

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

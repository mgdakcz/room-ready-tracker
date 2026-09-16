import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/lib/supabase";

export const STATUSES = [
  "Gotowe",
  "Wolne | Do sprzątnięcia",
  "Priorytet | Do sprzątnięcia",
  "Zajęte",
  "Sprzątanie w toku",
] as const;

export type RoomStatus = (typeof STATUSES)[number];

export type Room = {
  row: number;
  roomId: string;
  roomName: string;
  status: RoomStatus;
  cleanerName: string;
  timeStamp: string;
  startTime: string;
  totalTime: string;
  notes: string;
};

export type ChecklistItem = {
  row: number;
  task: string;
  done: boolean;
  doneBy: string | null;
  doneAt: string | null;
};

export type Comment = {
  row: number;
  text: string;
  createdAt: string;
};

// ---------- Row mappers (DB snake_case -> UI camelCase) ----------

function mapRoomRow(r: any): Room {
  return {
    row: r["Room ID"],
    roomId: String(r["Room ID"]),
    roomName: r["Room Name"] ?? "",
    status: r["Status"],
    cleanerName: r["Cleaner Name"] ?? "",
    timeStamp: r["Time Stamp"] ?? "",
    startTime: r["Start Time"] ?? "",
    totalTime: formatMinutes(r["Total Time"]),
    notes: r["Notes"] ?? "",
  };
}

function mapTaskRow(r: any): ChecklistItem {
  return {
    row: r.id,
    task: r.task,
    done: r.done,
    doneBy: r.done_by ?? null,
    doneAt: r.done_at ?? null,
  };
}

function mapCommentRow(r: any): Comment {
  return {
    row: r.id,
    text: r.text,
    createdAt: r.created_at ?? "",
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

function parseStamp(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, se ? +se : 0));
}

function diffMinutes(startStamp: string, endStamp: string): number {
  const a = parseStamp(startStamp);
  const b = parseStamp(endStamp);
  if (!a || !b) return 0;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

function formatMinutes(totalMinutes: number | null | undefined): string {
  const mins = Math.max(0, Math.round(totalMinutes ?? 0));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

// ---------- Room Server functions ----------

export const getRooms = createServerFn({ method: "GET" }).handler(async () => {
  const { data: rows, error } = await supabase
    .from("rooms")
    .select("*")
    .order("Room ID", { ascending: true });

  console.log(
    "[getRooms]",
    rows?.length ?? 0,
    "rows returned; sample keys:",
    rows?.[0] ? Object.keys(rows[0]) : "(no rows)",
    "error:",
    error,
  );

  if (error) throw new Error(error.message);
  const rooms: Room[] = (rows ?? []).map(mapRoomRow);
  return { rooms };
});

export const clockIn = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        row: z.number().int(),
        cleanerName: z.string().trim().min(1).max(80),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { stamp } = nowWarsaw();

    await supabase
      .from("rooms")
      .update({
        Status: "Sprzątanie w toku",
        "Time Stamp": stamp,
        "Cleaner Name": data.cleanerName,
        "Start Time": stamp,
      })
      .eq("Room ID", data.row);

    await supabase.from("logs").insert({
      action: "Clock in",
      cleaner_name: data.cleanerName,
      details: `Started at ${stamp}`,
      created_at: stamp,
    });

    return { ok: true };
  });

export const clockOut = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ row: z.number().int() }).parse(data))
  .handler(async ({ data }) => {
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select('"Start Time","Cleaner Name"')
      .eq("Room ID", data.row)
      .single();

    if (roomError || !room) throw new Error("Room not found");

    const { stamp } = nowWarsaw();
    const totalMinutes = diffMinutes(room["Start Time"], stamp);

    await supabase
      .from("rooms")
      .update({
        Status: "Gotowe",
        "Time Stamp": stamp,
        "End Time": stamp,
        "Total Time": totalMinutes,
      })
      .eq("Room ID", data.row);

    await supabase.from("logs").insert({
      action: "Clock out",
      cleaner_name: room["Cleaner Name"],
      details: `Finished at ${stamp} (total ${formatMinutes(totalMinutes)})`,
      created_at: stamp,
    });

    return { ok: true };
  });

export const setRoomStatus = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        row: z.number().int(),
        status: z.enum(STATUSES),
        pin: z.string().min(1).max(32),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const expected = process.env.OWNER_PIN;
    if (data.pin !== expected) throw new Error("Invalid PIN");

    const { stamp } = nowWarsaw();

    await supabase
      .from("rooms")
      .update({ Status: data.status, "Time Stamp": stamp })
      .eq("Room ID", data.row);

    await supabase.from("logs").insert({
      action: "Status change",
      details: `Set to "${data.status}" by owner`,
      created_at: stamp,
    });

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
        row: z.number().int(),
        notes: z.string().max(2000),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await supabase.from("rooms").update({ Notes: data.notes }).eq("Room ID", data.row);

    await supabase.from("logs").insert({
      action: "Notes updated",
      details: data.notes ? data.notes.slice(0, 500) : "(cleared)",
    });

    return { ok: true };
  });

// ---------- Ważne (Important) server functions ----------

export const getImportant = createServerFn({ method: "GET" }).handler(async () => {
  const { data: taskRows } = await supabase.from("important_tasks").select("*").order("id");
  const { data: commentRows } = await supabase.from("important_comments").select("*").order("id");
  const { data: notesData } = await supabase.from("important_notes").select("notes").single();

  const tasks: ChecklistItem[] = (taskRows ?? []).map(mapTaskRow);
  const comments: Comment[] = (commentRows ?? []).map(mapCommentRow);

  return {
    tasks,
    comments,
    notes: notesData?.notes || "",
  };
});

export const addChecklistItem = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        task: z.string().trim().min(1).max(500),
        pin: z.string().min(1).max(32),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const expected = process.env.OWNER_PIN;
    if (data.pin !== expected) throw new Error("Invalid PIN");

    const { stamp } = nowWarsaw();

    await supabase.from("important_tasks").insert({ task: data.task, done: false });

    await supabase.from("logs").insert({
      action: "Checklist add",
      details: data.task.slice(0, 500),
      created_at: stamp,
    });

    return { ok: true };
  });

export const toggleChecklistItem = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        row: z.number().int(),
        done: z.boolean(),
        cleanerName: z.string().trim().max(80).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    if (data.done && (!data.cleanerName || data.cleanerName.length === 0)) {
      throw new Error("Cleaner name required to check off a task");
    }

    const { stamp } = nowWarsaw();

    await supabase
      .from("important_tasks")
      .update({
        done: data.done,
        done_by: data.done ? data.cleanerName : null,
        done_at: data.done ? stamp : null,
      })
      .eq("id", data.row);

    await supabase.from("logs").insert({
      action: data.done ? "Checklist done" : "Checklist undone",
      cleaner_name: data.cleanerName,
      created_at: stamp,
    });

    return { ok: true };
  });

export const deleteChecklistItem = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        row: z.number().int(),
        pin: z.string().min(1).max(32),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const expected = process.env.OWNER_PIN;
    if (data.pin !== expected) throw new Error("Invalid PIN");

    const { stamp } = nowWarsaw();

    await supabase.from("important_tasks").delete().eq("id", data.row);

    await supabase.from("logs").insert({
      action: "Checklist delete",
      created_at: stamp,
    });

    return { ok: true };
  });

export const setImportantNotes = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        notes: z.string().max(5000),
        pin: z.string().min(1).max(32),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const expected = process.env.OWNER_PIN;
    if (data.pin !== expected) throw new Error("Invalid PIN");

    // Assuming a single row in important_notes table with id = 1
    await supabase.from("important_notes").update({ notes: data.notes }).eq("id", 1);

    await supabase.from("logs").insert({
      action: "Ważne notes updated",
      details: data.notes ? data.notes.slice(0, 500) : "(cleared)",
    });

    return { ok: true };
  });

export const addComment = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        text: z.string().trim().min(1).max(1000),
        pin: z.string().min(1).max(32),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const expected = process.env.OWNER_PIN;
    if (data.pin !== expected) throw new Error("Invalid PIN");

    const { stamp } = nowWarsaw();

    await supabase.from("important_comments").insert({
      text: data.text,
      created_at: stamp,
    });

    await supabase.from("logs").insert({
      action: "Comment add",
      details: data.text.slice(0, 500),
      created_at: stamp,
    });

    return { ok: true };
  });

export const deleteComment = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        row: z.number().int(),
        pin: z.string().min(1).max(32),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const expected = process.env.OWNER_PIN;
    if (data.pin !== expected) throw new Error("Invalid PIN");

    const { stamp } = nowWarsaw();

    await supabase.from("important_comments").delete().eq("id", data.row);

    await supabase.from("logs").insert({
      action: "Comment delete",
      created_at: stamp,
    });

    return { ok: true };
  });

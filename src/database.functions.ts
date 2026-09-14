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

// ---------- Room Server functions ----------

export const getRooms = createServerFn({ method: "GET" }).handler(async () => {
  const { data: rooms, error } = await supabase
    .from("rooms")
    .select("*")
    .order("id", { ascending: true });

  if (error) throw new Error(error.message);
  return { rooms };
});

export const clockIn = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({
      id: z.number().int(),
      cleanerName: z.string().trim().min(1).max(80),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const { stamp } = nowWarsaw();

    await supabase
      .from("rooms")
      .update({
        status: "Sprzątanie w toku",
        time_stamp: stamp,
        cleaner_name: data.cleanerName,
        start_time: stamp,
      })
      .eq("id", data.id);

    await supabase.from("logs").insert({
      action: "Clock in",
      cleaner_name: data.cleanerName,
      details: `Started at ${stamp}`,
      created_at: stamp,
    });

    return { ok: true };
  });

export const clockOut = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ id: z.number().int() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("start_time, cleaner_name")
      .eq("id", data.id)
      .single();

    if (roomError || !room) throw new Error("Room not found");

    const { stamp } = nowWarsaw();
    const totalTime = diffHHMM(room.start_time, stamp);

    await supabase
      .from("rooms")
      .update({
        status: "Gotowe",
        time_stamp: stamp,
        end_time: stamp,
        total_time: totalTime,
      })
      .eq("id", data.id);

    await supabase.from("logs").insert({
      action: "Clock out",
      cleaner_name: room.cleaner_name,
      details: `Finished at ${stamp} (total ${totalTime})`,
      created_at: stamp,
    });

    return { ok: true };
  });

export const setRoomStatus = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({
      id: z.number().int(),
      status: z.enum(STATUSES),
      pin: z.string().min(1).max(32),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const expected = process.env.OWNER_PIN;
    if (data.pin !== expected) throw new Error("Invalid PIN");

    const { stamp } = nowWarsaw();

    await supabase
      .from("rooms")
      .update({ status: data.status, time_stamp: stamp })
      .eq("id", data.id);

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
    z.object({
      id: z.number().int(),
      notes: z.string().max(2000),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    await supabase
      .from("rooms")
      .update({ notes: data.notes })
      .eq("id", data.id);

    await supabase.from("logs").insert({
      action: "Notes updated",
      details: data.notes ? data.notes.slice(0, 500) : "(cleared)",
    });

    return { ok: true };
  });

// ---------- Ważne (Important) server functions ----------

export const getImportant = createServerFn({ method: "GET" }).handler(async () => {
  const { data: tasks } = await supabase.from("important_tasks").select("*").order("id");
  const { data: comments } = await supabase.from("important_comments").select("*").order("id");
  const { data: notesData } = await supabase.from("important_notes").select("notes").single();

  return { 
    tasks: tasks || [], 
    comments: comments || [], 
    notes: notesData?.notes || "" 
  };
});

export const addChecklistItem = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({
      task: z.string().trim().min(1).max(500),
      pin: z.string().min(1).max(32),
    }).parse(data),
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
    z.object({
      id: z.number().int(),
      done: z.boolean(),
      cleanerName: z.string().trim().max(80).optional(),
    }).parse(data),
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
      .eq("id", data.id);

    await supabase.from("logs").insert({
      action: data.done ? "Checklist done" : "Checklist undone",
      cleaner_name: data.cleanerName,
      created_at: stamp,
    });

    return { ok: true };
  });

export const deleteChecklistItem = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({
      id: z.number().int(),
      pin: z.string().min(1).max(32),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const expected = process.env.OWNER_PIN;
    if (data.pin !== expected) throw new Error("Invalid PIN");

    const { stamp } = nowWarsaw();

    await supabase.from("important_tasks").delete().eq("id", data.id);

    await supabase.from("logs").insert({
      action: "Checklist delete",
      created_at: stamp,
    });

    return { ok: true };
  });

export const setImportantNotes = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({
      notes: z.string().max(5000),
      pin: z.string().min(1).max(32),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const expected = process.env.OWNER_PIN;
    if (data.pin !== expected) throw new Error("Invalid PIN");

    // Assuming a single row in important_notes table with id = 1
    await supabase
      .from("important_notes")
      .update({ notes: data.notes })
      .eq("id", 1); 

    await supabase.from("logs").insert({
      action: "Ważne notes updated",
      details: data.notes ? data.notes.slice(0, 500) : "(cleared)",
    });

    return { ok: true };
  });

export const addComment = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({
      text: z.string().trim().min(1).max(1000),
      pin: z.string().min(1).max(32),
    }).parse(data),
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
    z.object({
      id: z.number().int(),
      pin: z.string().min(1).max(32),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const expected = process.env.OWNER_PIN;
    if (data.pin !== expected) throw new Error("Invalid PIN");

    const { stamp } = nowWarsaw();

    await supabase.from("important_comments").delete().eq("id", data.id);

    await supabase.from("logs").insert({
      action: "Comment delete",
      created_at: stamp,
    });

    return { ok: true };
  });

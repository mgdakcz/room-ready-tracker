import { useMutation, useQueryClient, useQuery, queryOptions } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  BedDouble,
  CheckCircle2,
  ChevronRight,
  Clock3,
  DoorOpen,
  HelpCircle,
  Loader2,
  LogOut,
  Pencil,
  Play,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  STATUSES,
  addChecklistItem,
  addComment,
  clockIn,
  clockOut,
  deleteChecklistItem,
  deleteComment,
  getImportant,
  getRooms,
  setRoomNotes,
  setRoomStatus,
  toggleChecklistItem,
  type ChecklistItem,
  type Comment,
  type Room,
  type RoomStatus,
} from "@/lib/sheets.functions";
import { cn } from "@/lib/utils";

let sharedAudioCtx: AudioContext | null = null;
let chimeUnlockInstalled = false;

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) sharedAudioCtx = new AudioCtx();
  return sharedAudioCtx;
}

function installChimeUnlock() {
  if (chimeUnlockInstalled || typeof window === "undefined") return;
  chimeUnlockInstalled = true;
  const unlock = () => {
    const ctx = getAudioCtx();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  };
  ["pointerdown", "touchstart", "keydown", "click"].forEach((evt) =>
    window.addEventListener(evt, unlock, { once: false, passive: true }),
  );
}

function playChime() {
  if (typeof window === "undefined") return;
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + start + 0.02);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + start + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration + 0.05);
    };
    playTone(880, 0, 0.18);
    playTone(1320, 0.18, 0.22);
  } catch (e) {
    console.warn("Ping sound failed:", e);
  }
}

const roomsQueryOptions = queryOptions({
  queryKey: ["rooms"],
  queryFn: () => getRooms(),
  retry: false,
});

const importantQueryOptions = queryOptions({
  queryKey: ["important"],
  queryFn: () => getImportant(),
  retry: false,
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Room Cleaning Clock-In" },
      { name: "description", content: "Secure room cleaning clock-in dashboard for Google Sheets tracking." },
      { property: "og:title", content: "Room Cleaning Clock-In" },
      { property: "og:description", content: "Secure room cleaning clock-in dashboard for Google Sheets tracking." },
    ],
  }),
  loader: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(roomsQueryOptions);
    } catch (error) {
      console.error("Failed to preload rooms in loader:", error);
    }
  },
  component: Index,
});

function Index() {
  const { data, error: loadError, isLoading } = useQuery(roomsQueryOptions);
  const { data: importantData } = useQuery(importantQueryOptions);
  const hasImportant =
    (importantData?.tasks?.length ?? 0) > 0 || (importantData?.comments?.length ?? 0) > 0;
  const rooms: Room[] = (data?.rooms as Room[] | undefined) ?? [];
  const [cleanerName, setCleanerName] = useState("");
  const [ownerPin, setOwnerPin] = useState("");
  const [selectedFloor, setSelectedFloor] = useState("All");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const queryClient = useQueryClient();

  const floors = useMemo(() => {
    const values = Array.from(new Set(rooms.map((room) => room.floor).filter(Boolean)));
    return ["All", ...values];
  }, [rooms]);

  const visibleRooms = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rooms.filter((room) => {
      if (selectedFloor !== "All" && room.floor !== selectedFloor) return false;
      if (!q) return true;
      return (room.roomId ?? "").toLowerCase() === q;
    });
  }, [rooms, selectedFloor, search]);

  const stats = useMemo(
    () => ({
      priorytet: rooms.filter((room) => room.status === "Priorytet | Do sprzątnięcia").length,
      active: rooms.filter((room) => room.status === "Sprzątanie w toku").length,
      wolne: rooms.filter((room) => room.status === "Wolne | Do sprzątnięcia").length,
    }),
    [rooms],
  );

  useEffect(() => {
    installChimeUnlock();
  }, []);

  const prevStatusesRef = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    const current = new Map<string, string>();
    rooms.forEach((r) => current.set(`${r.row}-${r.roomName}`, r.status));
    const prev = prevStatusesRef.current;
    if (prev) {
      let transitioned = false;
      current.forEach((status, key) => {
        const before = prev.get(key);
        if (before && before !== "Gotowe" && status === "Gotowe") {
          transitioned = true;
        }
      });
      if (transitioned) {
        playChime();
      }
    }
    prevStatusesRef.current = current;
  }, [rooms]);

  const focusStatus = (status: RoomStatus) => {
    if (typeof document === "undefined") return;
    const el = document.getElementById(`status-${status}`) as HTMLDetailsElement | null;
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b border-baltic-200 bg-baltic-50">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <div className="mb-3 inline-flex items-center gap-2">
                <div className="inline-flex items-center gap-2 rounded-md border border-baltic-200 bg-background px-3 py-1 text-sm text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 text-baltic-500" />
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <button
                      type="button"
                      aria-label="Instrukcja / Instrukcija"
                      className="inline-flex items-center gap-2 rounded-md border border-baltic-200 bg-background px-3 py-1 text-sm text-muted-foreground transition-colors hover:bg-baltic-100 hover:text-baltic-800"
                    >
                      <HelpCircle className="h-4 w-4 text-baltic-500" />
                    </button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Instrukcja obslugi / Instrukcija</DialogTitle>
                      <DialogDescription>
                        Dashboard info.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-6 md:grid-cols-2">
                      <section className="space-y-3 text-sm text-slate-700">
                        <h3 className="text-base font-semibold text-baltic-800">PL</h3>
                        <ol className="list-decimal space-y-2 pl-5">
                          <li>Wpisz imiona osób sprzatajacych.</li>
                        </ol>
                      </section>
                    </div>
                  </DialogContent>
                </Dialog>
                <button
                  type="button"
                  onClick={() => playChime()}
                  aria-label="Test"
                  className="inline-flex items-center gap-2 rounded-md border border-baltic-200 bg-background px-3 py-1 text-sm text-muted-foreground transition-colors hover:bg-baltic-100 hover:text-baltic-800"
                >
                  🔔
                </button>
              </div>
              <h1 className="text-3xl tracking-tight text-baltic-800 md:text-5xl font-bold text-slate-700">Apartamenty | Sprzątanie</h1>
            </div>
            <div className="grid grid-cols-3 gap-2 md:min-w-80">
              <Metric label="Priorytet | Do sprzątnięcia" value={stats.priorytet} icon={Clock3} onClick={() => focusStatus("Priorytet | Do sprzątnięcia")} />
              <Metric label="Wolne | Do sprzątnięcia" value={stats.wolne} icon={CheckCircle2} onClick={() => focusStatus("Wolne | Do sprzątnięcia")} />
              <Metric label="Sprzątanie w toku" value={stats.active} icon={DoorOpen} onClick={() => focusStatus("Sprzątanie w toku")} />
            </div>
          </div>

          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Szukaj apartamentu"
          />

          <div className="grid gap-3 rounded-md border bg-background p-3 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Sprzątający
              <Input
                value={cleanerName}
                onChange={(event) => setCleanerName(event.target.value)}
                placeholder="Osoby sprzątające"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Owner PIN
              <Input
                value={ownerPin}
                onChange={(event) => setOwnerPin(event.target.value)}
                type="password"
                placeholder="Wymagany PIN"
              />
            </label>
          </div>

          {loadError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Failed to load rooms
            </div>
          ) : null}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Tabs defaultValue="rooms" className="w-full">
          <TabsList className="mb-4 h-11">
            <TabsTrigger value="rooms" className="h-9 px-4">
              Apartamenty
            </TabsTrigger>
            <TabsTrigger
              value="important"
              className={cn(
                "h-9 px-4",
                hasImportant &&
                  "animate-pulse bg-red-200 text-red-900 data-[state=active]:bg-red-200 data-[state=active]:text-red-900",
              )}
            >
              Ważne
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rooms">
            <div className="mb-4 flex flex-wrap gap-2">
              {floors.filter((floor) => floor !== "All").map((floor) => (
                <Button
                  key={floor}
                  type="button"
                  variant={selectedFloor === floor ? "default" : "outline"}
                  onClick={() => setSelectedFloor(floor)}
                  className="h-10"
                >
                  {floor}
                </Button>
              ))}
            </div>
            <div className="flex flex-col gap-6">
              {isLoading && rooms.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading rooms...
                </div>
              ) : null}
              {([
                "Priorytet | Do sprzątnięcia",
                "Wolne | Do sprzątnięcia",
                "Sprzątanie w toku",
                "Zajęte",
                "Gotowe",
              ] as RoomStatus[]).map((status) => {
                const group = visibleRooms.filter((r) => r.status === status);
                if (group.length === 0) return null;
                const defaultOpen =
                  status === "Priorytet | Do sprzątnięcia" ||
                  status === "Wolne | Do sprzątnięcia";
                return (
                  <details
                    key={status}
                    id={`status-${status}`}
                    open={defaultOpen}
                    className="group rounded-md border bg-

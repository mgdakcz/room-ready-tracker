import { useMutation, useQueryClient, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  BedDouble,
  CheckCircle2,
  Clock3,
  DoorOpen,
  Loader2,
  LogOut,
  Pencil,
  Play,
  Save,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  STATUSES,
  clockIn,
  clockOut,
  getRooms,
  setRoomNotes,
  setRoomStatus,
  type Room,
  type RoomStatus,
} from "@/lib/sheets.functions";
import { cn } from "@/lib/utils";

const roomsQueryOptions = queryOptions({
  queryKey: ["rooms"],
  queryFn: () => getRooms(),
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
  loader: ({ context }) => context.queryClient.ensureQueryData(roomsQueryOptions),
  component: Index,
});

function Index() {
  const { data } = useSuspenseQuery(roomsQueryOptions);
  const rooms = data.rooms;
  const [cleanerName, setCleanerName] = useState("");
  const [ownerPin, setOwnerPin] = useState("");
  const [selectedFloor, setSelectedFloor] = useState("All");
  const [error, setError] = useState("");
  const queryClient = useQueryClient();

  const floors = useMemo(() => {
    const values = Array.from(new Set(rooms.map((room) => room.floor).filter(Boolean)));
    return ["All", ...values];
  }, [rooms]);

  const visibleRooms = useMemo(() => {
    if (selectedFloor === "All") return rooms;
    return rooms.filter((room) => room.floor === selectedFloor);
  }, [rooms, selectedFloor]);

  const stats = useMemo(
    () => ({
      ready: rooms.filter((room) => room.status === "Gotowe").length,
      pending: rooms.filter((room) => room.status.includes("do sprzątnięcia")).length,
      active: rooms.filter((room) => room.status === "Sprzątanie w toku").length,
    }),
    [rooms],
  );

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b bg-muted/30">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1 text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Google Sheets connector active
              </div>
              <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">Room cleaning</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
                Clock cleaning work directly into the connected Rooms sheet.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 md:min-w-80">
              <Metric label="Ready" value={stats.ready} icon={CheckCircle2} />
              <Metric label="Waiting" value={stats.pending} icon={DoorOpen} />
              <Metric label="Active" value={stats.active} icon={Clock3} />
            </div>
          </div>

          <div className="grid gap-3 rounded-md border bg-background p-3 md:grid-cols-[1fr_auto] md:items-center">
            <label className="grid gap-2 text-sm font-medium">
              Cleaner name
              <Input
                value={cleanerName}
                onChange={(event) => setCleanerName(event.target.value)}
                placeholder="Enter your name before starting"
                className="h-11"
              />
            </label>
            <div className="flex flex-wrap gap-2 md:justify-end">
              {floors.map((floor) => (
                <Button
                  key={floor}
                  type="button"
                  variant={selectedFloor === floor ? "default" : "outline"}
                  onClick={() => setSelectedFloor(floor)}
                  className="h-11"
                >
                  {floor === "All" ? "All floors" : floor}
                </Button>
              ))}
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-6 sm:px-6 lg:grid-cols-2 lg:px-8 xl:grid-cols-3">
        {visibleRooms.map((room) => (
          <RoomCard
            key={`${room.row}-${room.roomName}`}
            room={room}
            cleanerName={cleanerName}
            ownerPin={ownerPin}
            setOwnerPin={setOwnerPin}
            setError={setError}
            onChanged={() => queryClient.invalidateQueries({ queryKey: ["rooms"] })}
          />
        ))}
      </section>
    </main>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof CheckCircle2 }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function RoomCard({
  room,
  cleanerName,
  ownerPin,
  setOwnerPin,
  setError,
  onChanged,
}: {
  room: Room;
  cleanerName: string;
  ownerPin: string;
  setOwnerPin: (pin: string) => void;
  setError: (message: string) => void;
  onChanged: () => void;
}) {
  const [notes, setNotes] = useState(room.notes);
  const runClockIn = useServerFn(clockIn);
  const runClockOut = useServerFn(clockOut);
  const runSetStatus = useServerFn(setRoomStatus);
  const runSetNotes = useServerFn(setRoomNotes);

  const mutationOptions = {
    onMutate: () => setError(""),
    onSuccess: onChanged,
    onError: (err: Error) => setError(err.message),
  };

  const clockInMutation = useMutation({
    mutationFn: () => runClockIn({ data: { row: room.row, cleanerName: cleanerName.trim() } }),
    ...mutationOptions,
  });
  const clockOutMutation = useMutation({
    mutationFn: () => runClockOut({ data: { row: room.row } }),
    ...mutationOptions,
  });
  const statusMutation = useMutation({
    mutationFn: (status: RoomStatus) => runSetStatus({ data: { row: room.row, status, pin: ownerPin } }),
    ...mutationOptions,
  });
  const notesMutation = useMutation({
    mutationFn: () => runSetNotes({ data: { row: room.row, notes } }),
    ...mutationOptions,
  });

  const isBusy =
    clockInMutation.isPending ||
    clockOutMutation.isPending ||
    statusMutation.isPending ||
    notesMutation.isPending;
  const canStart = cleanerName.trim().length > 0 && !isBusy;
  const isActive = room.status === "Sprzątanie w toku";

  function saveNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    notesMutation.mutate();
  }

  return (
    <article className="flex min-h-[420px] flex-col rounded-md border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <BedDouble className="h-4 w-4" />
            {room.roomId || `Row ${room.row}`}
          </div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">{room.roomName}</h2>
        </div>
        <StatusBadge status={room.status} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <Info label="Cleaner" value={room.cleanerName || "—"} />
        <Info label="Updated" value={room.timeStamp || "—"} />
        <Info label="Started" value={room.startTime || "—"} />
        <Info label="Total" value={room.totalTime || "—"} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {isActive ? (
          <Button type="button" onClick={() => clockOutMutation.mutate()} disabled={isBusy} className="h-11">
            {clockOutMutation.isPending ? <Loader2 className="animate-spin" /> : <LogOut />}
            Finish
          </Button>
        ) : (
          <Button type="button" onClick={() => clockInMutation.mutate()} disabled={!canStart} className="h-11">
            {clockInMutation.isPending ? <Loader2 className="animate-spin" /> : <Play />}
            Start
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={() => statusMutation.mutate("Gotowe")}
          disabled={isBusy || !ownerPin}
          className="h-11"
        >
          <CheckCircle2 />
          Ready
        </Button>
      </div>

      <div className="mt-4 grid gap-2">
        <label className="text-sm font-medium" htmlFor={`pin-${room.row}`}>
          Owner PIN
        </label>
        <Input
          id={`pin-${room.row}`}
          value={ownerPin}
          onChange={(event) => setOwnerPin(event.target.value)}
          type="password"
          placeholder="Required for manual status changes"
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {STATUSES.filter((status) => status !== "Sprzątanie w toku" && status !== "Gotowe").map((status) => (
          <Button
            key={status}
            type="button"
            variant="secondary"
            onClick={() => statusMutation.mutate(status)}
            disabled={isBusy || !ownerPin}
            className="h-auto min-h-10 whitespace-normal px-3 py-2 text-xs"
          >
            <Sparkles />
            {status}
          </Button>
        ))}
      </div>

      <form onSubmit={saveNotes} className="mt-auto grid gap-2 pt-4">
        <label className="flex items-center gap-2 text-sm font-medium" htmlFor={`notes-${room.row}`}>
          <Pencil className="h-4 w-4" />
          Notes
        </label>
        <Textarea
          id={`notes-${room.row}`}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="min-h-20 resize-none"
          placeholder="Add room notes"
        />
        <Button type="submit" variant="outline" disabled={isBusy || notes === room.notes} className="h-10">
          {notesMutation.isPending ? <Loader2 className="animate-spin" /> : <Save />}
          Save notes
        </Button>
      </form>
    </article>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 min-h-5 truncate text-sm font-medium">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "Gotowe" ? "default" : status === "Sprzątanie w toku" ? "secondary" : "outline";
  return (
    <Badge
      variant={variant}
      className={cn("max-w-36 justify-center whitespace-normal text-center leading-tight", {
        "border-primary/50 bg-primary/10 text-primary": status === "Sprzątanie w toku",
      })}
    >
      {status || "No status"}
    </Badge>
  );
}

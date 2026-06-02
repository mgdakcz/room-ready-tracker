import { useMutation, useQueryClient, useQuery, queryOptions } from "@tanstack/react-query";
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
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  STATUSES,
  addChecklistItem,
  clockIn,
  clockOut,
  deleteChecklistItem,
  getImportant,
  getRooms,
  setImportantNotes,
  setRoomNotes,
  setRoomStatus,
  toggleChecklistItem,
  type ChecklistItem,
  type Room,
  type RoomStatus,
} from "@/lib/sheets.functions";
import { cn } from "@/lib/utils";

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
  const rooms: Room[] = (data?.rooms as Room[] | undefined) ?? [];
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
      priorytet: rooms.filter((room) => room.status === "Priorytet / do sprzątnięcia").length,
      active: rooms.filter((room) => room.status === "Sprzątanie w toku").length,
      wolne: rooms.filter((room) => room.status === "Wolne / do sprzątnięcia").length,
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
              </div>
              <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">Apartamenty | Sprzątanie</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
                Clock cleaning work directly into the connected Rooms sheet.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 md:min-w-80">
              <Metric label="Priorytet / do sprzątnięcia" value={stats.priorytet} icon={Clock3} />
              <Metric label="Sprzątanie w toku" value={stats.active} icon={DoorOpen} />
              <Metric label="Wolne / do sprzątnięcia" value={stats.wolne} icon={CheckCircle2} />
            </div>
          </div>

          <div className="grid gap-3 rounded-md border bg-background p-3 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Cleaner name
              <Input
                value={cleanerName}
                onChange={(event) => setCleanerName(event.target.value)}
                placeholder="Enter your name before starting"
                className="h-11"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Owner PIN
              <Input
                value={ownerPin}
                onChange={(event) => setOwnerPin(event.target.value)}
                type="password"
                placeholder="Required for owner actions"
                className="h-11"
              />
            </label>
          </div>

          {loadError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Failed to load rooms: {loadError instanceof Error ? loadError.message : String(loadError)}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Tabs defaultValue="rooms" className="w-full">
          <TabsList className="mb-4 h-11">
            <TabsTrigger value="rooms" className="h-9 px-4">
              Pokoje
            </TabsTrigger>
            <TabsTrigger value="important" className="h-9 px-4">
              Ważne
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rooms">
            <div className="mb-4 flex flex-wrap gap-2">
              {floors.map((floor) => (
                <Button
                  key={floor}
                  type="button"
                  variant={selectedFloor === floor ? "default" : "outline"}
                  onClick={() => setSelectedFloor(floor)}
                  className="h-10"
                >
                  {floor === "All" ? "All floors" : floor}
                </Button>
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {isLoading && rooms.length === 0 ? (
                <div className="col-span-full flex items-center justify-center py-12 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading rooms…
                </div>
              ) : null}
              {visibleRooms.map((room) => (
                <RoomCard
                  key={`${room.row}-${room.roomName}`}
                  room={room}
                  cleanerName={cleanerName}
                  ownerPin={ownerPin}
                  setError={setError}
                  onChanged={() => queryClient.invalidateQueries({ queryKey: ["rooms"] })}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="important">
            <ImportantPanel
              cleanerName={cleanerName}
              ownerPin={ownerPin}
              setError={setError}
            />
          </TabsContent>
        </Tabs>
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
  setError,
  onChanged,
}: {
  room: Room;
  cleanerName: string;
  ownerPin: string;
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

function ImportantPanel({
  cleanerName,
  ownerPin,
  setError,
}: {
  cleanerName: string;
  ownerPin: string;
  setError: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const { data, error: loadError, isLoading } = useQuery(importantQueryOptions);
  const tasks: ChecklistItem[] = data?.tasks ?? [];
  const serverNotes = data?.notes ?? "";

  const [newTask, setNewTask] = useState("");
  const [notes, setNotes] = useState(serverNotes);

  useEffect(() => {
    setNotes(serverNotes);
  }, [serverNotes]);

  const runAdd = useServerFn(addChecklistItem);
  const runToggle = useServerFn(toggleChecklistItem);
  const runDelete = useServerFn(deleteChecklistItem);
  const runSetNotes = useServerFn(setImportantNotes);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["important"] });
  const onError = (err: Error) => setError(err.message);

  const addMutation = useMutation({
    mutationFn: () => runAdd({ data: { task: newTask.trim(), pin: ownerPin } }),
    onMutate: () => setError(""),
    onSuccess: () => {
      setNewTask("");
      invalidate();
    },
    onError,
  });

  const toggleMutation = useMutation({
    mutationFn: (vars: { row: number; done: boolean }) =>
      runToggle({
        data: { row: vars.row, done: vars.done, cleanerName: cleanerName.trim() || undefined },
      }),
    onMutate: () => setError(""),
    onSuccess: invalidate,
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: (row: number) => runDelete({ data: { row, pin: ownerPin } }),
    onMutate: () => setError(""),
    onSuccess: invalidate,
    onError,
  });

  const notesMutation = useMutation({
    mutationFn: () => runSetNotes({ data: { notes, pin: ownerPin } }),
    onMutate: () => setError(""),
    onSuccess: invalidate,
    onError,
  });

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newTask.trim()) return;
    addMutation.mutate();
  }

  function handleSaveNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    notesMutation.mutate();
  }

  function handleToggle(item: ChecklistItem, next: boolean) {
    if (next && !cleanerName.trim()) {
      setError("Enter your name above before checking off a task.");
      return;
    }
    toggleMutation.mutate({ row: item.row, done: next });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <article className="flex flex-col rounded-md border bg-card p-4 shadow-sm">
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-xl font-semibold tracking-tight">Checklist</h2>
          <span className="text-xs text-muted-foreground">
            {tasks.filter((t) => t.done).length} / {tasks.length} done
          </span>
        </header>

        {loadError ? (
          <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {loadError instanceof Error ? loadError.message : String(loadError)}
          </div>
        ) : null}

        <ul className="flex-1 space-y-2">
          {isLoading && tasks.length === 0 ? (
            <li className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </li>
          ) : null}
          {!isLoading && tasks.length === 0 ? (
            <li className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              No tasks yet. The owner can add one below.
            </li>
          ) : null}
          {tasks.map((item) => (
            <li
              key={item.row}
              className="flex items-start gap-3 rounded-md border bg-background px-3 py-2"
            >
              <Checkbox
                id={`task-${item.row}`}
                checked={item.done}
                onCheckedChange={(checked) => handleToggle(item, checked === true)}
                disabled={toggleMutation.isPending}
                className="mt-1"
              />
              <label
                htmlFor={`task-${item.row}`}
                className={cn(
                  "flex-1 cursor-pointer text-sm",
                  item.done && "text-muted-foreground line-through",
                )}
              >
                <span className="block font-medium">{item.task}</span>
                {item.done && item.doneBy ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    ✓ {item.doneBy}
                    {item.doneAt ? ` · ${item.doneAt}` : ""}
                  </span>
                ) : null}
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => deleteMutation.mutate(item.row)}
                disabled={!ownerPin || deleteMutation.isPending}
                title={ownerPin ? "Delete (owner)" : "Owner PIN required"}
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>

        <form onSubmit={handleAdd} className="mt-4 grid gap-2 border-t pt-4">
          <label className="text-sm font-medium" htmlFor="new-task">
            Add task (owner)
          </label>
          <div className="flex gap-2">
            <Input
              id="new-task"
              value={newTask}
              onChange={(event) => setNewTask(event.target.value)}
              placeholder="e.g. Restock towels on 2nd floor"
              className="h-11"
            />
            <Button
              type="submit"
              disabled={!newTask.trim() || !ownerPin || addMutation.isPending}
              className="h-11"
            >
              {addMutation.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
              Add
            </Button>
          </div>
          {!ownerPin ? (
            <p className="text-xs text-muted-foreground">Enter the Owner PIN above to add tasks.</p>
          ) : null}
        </form>
      </article>

      <article className="flex flex-col rounded-md border bg-card p-4 shadow-sm">
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-xl font-semibold tracking-tight">Notes for tomorrow</h2>
          <Pencil className="h-4 w-4 text-muted-foreground" />
        </header>
        <form onSubmit={handleSaveNotes} className="flex flex-1 flex-col gap-3">
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Important notes the owner wants the cleaner to see…"
            className="min-h-[260px] flex-1 resize-none"
            disabled={!ownerPin}
          />
          <Button
            type="submit"
            disabled={!ownerPin || notes === serverNotes || notesMutation.isPending}
            className="h-11"
          >
            {notesMutation.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            Save notes
          </Button>
          {!ownerPin ? (
            <p className="text-xs text-muted-foreground">
              Enter the Owner PIN above to edit notes. Cleaners can read them anytime.
            </p>
          ) : null}
        </form>
      </article>
    </div>
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

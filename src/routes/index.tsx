import { useMutation, useQueryClient, useQuery, queryOptions } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  BedDouble,
  CheckCircle2,
  ChevronRight,
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
import { FormEvent, useMemo, useState } from "react";

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
      priorytet: rooms.filter((room) => room.status === "Priorytet | Do sprzątnięcia").length,
      active: rooms.filter((room) => room.status === "Sprzątanie w toku").length,
      wolne: rooms.filter((room) => room.status === "Wolne | Do sprzątnięcia").length,
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
                {"\u200b"}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 md:min-w-80">
              <Metric label="Priorytet | Do sprzątnięcia" value={stats.priorytet} icon={Clock3} />
              <Metric label="Wolne | Do sprzątnięcia" value={stats.wolne} icon={CheckCircle2} />
              <Metric label="Sprzątanie w toku" value={stats.active} icon={DoorOpen} />
            </div>
          </div>

          <div className="grid gap-3 rounded-md border bg-background p-3 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Sprzątający
              <Input
                value={cleanerName}
                onChange={(event) => setCleanerName(event.target.value)}
                placeholder="Osoby sprzątające apartament"
                className="h-11"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Owner PIN
              <Input
                value={ownerPin}
                onChange={(event) => setOwnerPin(event.target.value)}
                type="password"
                placeholder="Wymagany dla dodatkowych opcji"
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
              Apartamenty
            </TabsTrigger>
            <TabsTrigger value="important" className="h-9 px-4">
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
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading rooms…
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
                    open={defaultOpen}
                    className="group rounded-md border bg-card shadow-sm"
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/40">
                      <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                      <span
                        className={cn("inline-block h-2 w-2 rounded-full", {
                          "bg-destructive": status === "Priorytet | Do sprzątnięcia",
                          "bg-primary": status === "Sprzątanie w toku",
                          "bg-muted-foreground": status === "Wolne | Do sprzątnięcia",
                          "bg-green-500": status === "Gotowe",
                        })}
                      />
                      {status}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        ({group.length})
                      </span>
                    </summary>
                    <div className="flex flex-col gap-3 border-t p-3">
                      {group.map((room) => (
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
                  </details>
                );
              })}
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
  const [showNotes, setShowNotes] = useState(false);
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
    <article className="flex flex-col gap-3 rounded-md border bg-card p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xl font-bold text-foreground">
            <BedDouble className="h-5 w-5" />
            {room.roomId || `Row ${room.row}`}
          </div>
          <StatusBadge status={room.status} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>Sprzątający: <span className="font-medium text-foreground">{room.cleanerName || "—"}</span></span>
          <span>Aktualizacja: <span className="font-medium text-foreground">{room.timeStamp || "—"}</span></span>
          <span>Start: <span className="font-medium text-foreground">{room.startTime || "—"}</span></span>
          <span>Suma: <span className="font-medium text-foreground">{room.totalTime || "—"}</span></span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
        {isActive ? (
          <Button type="button" onClick={() => clockOutMutation.mutate()} disabled={isBusy} className="h-10">
            {clockOutMutation.isPending ? <Loader2 className="animate-spin" /> : <LogOut className="h-4 w-4" />}
            <span className="hidden sm:inline">Finish</span>
          </Button>
        ) : (
          <Button type="button" onClick={() => clockInMutation.mutate()} disabled={!canStart} className="h-10">
            {clockInMutation.isPending ? <Loader2 className="animate-spin" /> : <Play className="h-4 w-4" />}
            <span className="hidden sm:inline">Start</span>
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={() => statusMutation.mutate("Gotowe")}
          disabled={isBusy || !ownerPin}
          className="h-10"
        >
          <CheckCircle2 className="h-4 w-4" />
          <span className="hidden sm:inline">Ready</span>
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => statusMutation.mutate("Priorytet | Do sprzątnięcia")}
          disabled={isBusy || !ownerPin}
          className="h-10"
        >
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">Priorytet</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setShowNotes((s) => !s)}
          className="h-10 px-2"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>

      {showNotes ? (
        <form onSubmit={saveNotes} className="w-full border-t pt-3 sm:col-span-full">
          <Textarea
            id={`notes-${room.row}`}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="min-h-16 resize-none"
            placeholder="Dodaj notatki do pokoju"
          />
          <div className="mt-2 flex justify-end">
            <Button type="submit" variant="outline" disabled={isBusy || notes === room.notes} className="h-9">
              {notesMutation.isPending ? <Loader2 className="animate-spin" /> : <Save className="h-4 w-4" />}
              Zapisz notatki
            </Button>
          </div>
        </form>
      ) : null}
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
  const comments: Comment[] = data?.comments ?? [];

  const [newTask, setNewTask] = useState("");
  const [newComment, setNewComment] = useState("");

  const runAdd = useServerFn(addChecklistItem);
  const runToggle = useServerFn(toggleChecklistItem);
  const runDelete = useServerFn(deleteChecklistItem);
  const runAddComment = useServerFn(addComment);
  const runDeleteComment = useServerFn(deleteComment);

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

  const addCommentMutation = useMutation({
    mutationFn: () => runAddComment({ data: { text: newComment.trim(), pin: ownerPin } }),
    onMutate: () => setError(""),
    onSuccess: () => {
      setNewComment("");
      invalidate();
    },
    onError,
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (row: number) => runDeleteComment({ data: { row, pin: ownerPin } }),
    onMutate: () => setError(""),
    onSuccess: invalidate,
    onError,
  });

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newTask.trim()) return;
    addMutation.mutate();
  }

  function handleAddComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newComment.trim()) return;
    addCommentMutation.mutate();
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
          <h2 className="text-xl font-semibold tracking-tight">​Lista Zadań</h2>
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
            Dodaj zadanie (owner)
          </label>
          <div className="flex gap-2">
            <Input
              id="new-task"
              value={newTask}
              onChange={(event) => setNewTask(event.target.value)}
              placeholder="Dodaj dostawkę w apartamencie nr 2"
              className="h-11"
            />
            <Button
              type="submit"
              disabled={!newTask.trim() || !ownerPin || addMutation.isPending}
              className="h-11"
            >
              {addMutation.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
              Dodaj
            </Button>
          </div>
          {!ownerPin ? (
            <p className="text-xs text-muted-foreground">​Wpisz PIN żeby dodać zadanie.</p>
          ) : null}
        </form>
      </article>

      <article className="flex flex-col rounded-md border bg-card p-4 shadow-sm">
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-xl font-semibold tracking-tight">​Ważne na jutro</h2>
          <Pencil className="h-4 w-4 text-muted-foreground" />
        </header>

        <ul className="flex-1 space-y-2">
          {isLoading && comments.length === 0 ? (
            <li className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </li>
          ) : null}
          {!isLoading && comments.length === 0 ? (
            <li className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              Brak komentarzy. Owner może dodać poniżej.
            </li>
          ) : null}
          {comments.map((item) => (
            <li
              key={item.row}
              className="flex items-start gap-3 rounded-md border bg-background px-3 py-2"
            >
              <div className="flex-1 text-sm">
                <p className="whitespace-pre-wrap font-medium">{item.text}</p>
                {item.createdAt ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.createdAt}</p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => deleteCommentMutation.mutate(item.row)}
                disabled={!ownerPin || deleteCommentMutation.isPending}
                title={ownerPin ? "Delete (owner)" : "Owner PIN required"}
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>

        <form onSubmit={handleAddComment} className="mt-4 grid gap-2 border-t pt-4">
          <label className="text-sm font-medium" htmlFor="new-comment">
            Dodaj komentarz (owner)
          </label>
          <div className="flex gap-2">
            <Textarea
              id="new-comment"
              value={newComment}
              onChange={(event) => setNewComment(event.target.value)}
              placeholder="Informacja ważna na jutro…"
              className="min-h-[80px] flex-1 resize-none"
            />
            <Button
              type="submit"
              disabled={!newComment.trim() || !ownerPin || addCommentMutation.isPending}
              className="h-11 self-end"
            >
              {addCommentMutation.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
              Dodaj
            </Button>
          </div>
          {!ownerPin ? (
            <p className="text-xs text-muted-foreground">​Wpisz PIN żeby dodać komentarz.</p>
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
      className={cn("max-w-36 justify-center whitespace-normal text-center leading-tight border-2 font-sans", {
        "border-primary/50 bg-primary/10 text-primary": status === "Sprzątanie w toku",
      })}
    >
      {status || "No status"}
    </Badge>
  );
}

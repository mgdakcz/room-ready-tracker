import { FormEvent, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { installChimeUnlock, playChime } from "@/lib/chime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Message {
  id: number;
  text: string;
  user_name: string;
  created_at: string;
}

export function ChatBox({
  currentUser,
  setError,
}: {
  currentUser: string;
  setError?: (message: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    installChimeUnlock();
  }, []);

  useEffect(() => {
    let active = true;

    async function fetchMessages() {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(50);

      if (!active) return;
      if (error) {
        setError?.(`Failed to load chat: ${error.message}`);
      } else if (data) {
        setMessages(data);
      }
      setIsLoading(false);
    }

    fetchMessages();

    // Subscribe to live changes using Supabase Realtime
    const channel = supabase
      .channel("public:messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
          playChime();
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [setError]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = newMessage.trim();
    if (!text || isSending) return;

    setIsSending(true);
    const { error } = await supabase.from("messages").insert({
      text,
      user_name: currentUser || "Anonymous",
    });
    setIsSending(false);

    if (error) {
      setError?.(`Failed to send message: ${error.message}`);
      return;
    }
    setNewMessage("");
  };

  return (
    <article className="flex flex-col rounded-md border bg-card p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <MessageSquare className="h-5 w-5 text-muted-foreground" />
          Czat zespołu
        </h2>
      </header>

      <div
        ref={scrollRef}
        className="flex h-80 flex-col gap-2 overflow-y-auto rounded-md border bg-background p-3"
      >
        {isLoading && messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Ładowanie wiadomości…
          </div>
        ) : null}
        {!isLoading && messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            Brak wiadomości. Napisz coś jako pierwszy!
          </div>
        ) : null}
        {messages.map((msg) => {
          const isOwn = Boolean(currentUser) && msg.user_name === currentUser;
          return (
            <div
              key={msg.id}
              className={cn(
                "max-w-[80%] rounded-md border px-3 py-2 text-sm",
                isOwn ? "self-end border-primary/30 bg-primary/10" : "self-start bg-card",
              )}
            >
              <p className="text-xs font-semibold text-muted-foreground">{msg.user_name}</p>
              <p className="whitespace-pre-wrap">{msg.text}</p>
            </div>
          );
        })}
      </div>

      <form onSubmit={handleSend} className="mt-3 flex gap-2 border-t pt-3">
        <Input
          value={newMessage}
          onChange={(event) => setNewMessage(event.target.value)}
          placeholder="Napisz wiadomość…"
          disabled={isSending}
          className="flex-1"
        />
        <Button
          type="submit"
          disabled={!newMessage.trim() || isSending}
          className="h-10 w-10 p-0"
          aria-label="Wyślij"
        >
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </article>
  );
}

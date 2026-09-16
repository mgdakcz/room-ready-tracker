import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Message {
  id: number;
  text: string;
  user_name: string;
  created_at: string;
}

export function ChatBox({ currentUser }: { currentUser: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');

  useEffect(() => {
    // 1. Fetch existing messages
    async function fetchMessages() {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(50);

      if (!error && data) {
        setMessages(data);
      }
    }

    fetchMessages();

    // 2. Subscribe to live changes using Supabase Realtime
    const channel = supabase
      .channel('public:messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    await supabase.from('messages').insert({
      text: newMessage.trim(),
      user_name: currentUser || 'Anonymous',
    });

    setNewMessage('');
  };

  return (
    <div style={{ border: '1px solid #ccc', padding: '16px', borderRadius: '8px', maxWidth: '400px' }}>
      <h3>Team Chat</h3>
      <div style={{ height: '200px', overflowY: 'scroll', border: '1px solid #eee', marginBottom: '10px', padding: '8px' }}>
        {messages.map((msg) => (
          <div key={msg.id} style={{ marginBottom: '8px' }}>
            <strong>{msg.user_name}: </strong>
            <span>{msg.text}</span>
          </div>
        ))}
      </div>
      <form onSubmit={handleSend} style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          style={{ flex: 1, padding: '4px' }}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}

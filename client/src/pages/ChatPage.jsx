import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useWs } from '../context/WsContext.jsx';

export default function ChatPage() {
  const { user } = useAuth();
  const { send, subscribe } = useWs();
  const channels = useMemo(() => {
    const list = [{ key: 'global', label: 'Global' }];
    if (user.city) list.push({ key: `city:${user.city.toLowerCase()}`, label: user.city });
    return list;
  }, [user.city]);
  const [channel, setChannel] = useState('global');
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    api(`/messages?channel=${encodeURIComponent(channel)}`).then(({ messages }) => setMessages(messages));
  }, [channel]);

  useEffect(() => {
    return subscribe('chat:message', (msg) => {
      if (msg.channel !== channel) return;
      setMessages((prev) => [...prev, msg]);
    });
  }, [subscribe, channel]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const onSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    send({ type: 'chat', channel, text: text.trim() });
    setText('');
  };

  return (
    <div className="page chat-page">
      <div className="scope-tabs">
        {channels.map((c) => (
          <button key={c.key} className={channel === c.key ? 'active' : ''} onClick={() => setChannel(c.key)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="chat-messages">
        {messages.map((m) => (
          <div key={m.id} className={`chat-message ${m.sender_id === user.id ? 'mine' : ''}`}>
            <span className="chat-nickname">{m.nickname || 'unknown'}</span>
            <span className="chat-text">{m.text}</span>
          </div>
        ))}
        {messages.length === 0 && <p className="muted">No messages yet — say hi 👋</p>}
        <div ref={bottomRef} />
      </div>
      <form className="chat-input-row" onSubmit={onSubmit}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message #${channel}`} maxLength={500} />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}

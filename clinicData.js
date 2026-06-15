import React, { useState, useRef, useEffect } from "react";
import { getClinicSettings, getOrCreateConversation } from "../lib/clinicData";

// The conversation engine Edge Function handles AI replies, tool use
// (availability checking, booking, escalation) and persistence.
const CONVERSATION_ENGINE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/conversation-engine`;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Generate (or reuse) a per-browser session id so the same visitor
// resumes their conversation across page loads.
function getSessionId() {
  const key = "clinic_chat_session_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export default function ClinicReceptionist() {
  const [clinic, setClinic] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [escalated, setEscalated] = useState(false);
  const scrollRef = useRef(null);

  // Load clinic settings + restore/create conversation on mount
  useEffect(() => {
    (async () => {
      try {
        const clinicData = await getClinicSettings();
        setClinic(clinicData);

        const sessionId = getSessionId();
        const conv = await getOrCreateConversation({
          clinicId: clinicData.id,
          channel: "web",
          channelUserId: sessionId,
        });
        setConversation(conv);
        setEscalated(conv.status === "needs_human");

        if (conv.messages && conv.messages.length > 0) {
          setMessages(conv.messages);
        } else {
          setMessages([
            {
              role: "assistant",
              text: `Hi, welcome to ${clinicData.name}! I'm your virtual receptionist. I can answer questions about our hours, services, pricing, and more — or help you book an appointment. How can I help you today?`,
            },
          ]);
          // Note: this greeting is shown locally but not persisted —
          // the conversation row starts empty until the first real
          // exchange via conversation-engine.
        }
      } catch (e) {
        console.error("Failed to initialize clinic chat:", e);
        setMessages([
          {
            role: "assistant",
            text: "Sorry, I'm having trouble connecting right now. Please call the clinic directly.",
          },
        ]);
      } finally {
        setInitializing(false);
      }
    })();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading || !conversation || !clinic) return;

    const userMessage = { role: "user", text };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(CONVERSATION_ENGINE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          clinic_id: clinic.id,
          conversation_id: conversation.id,
          message: text,
        }),
      });

      if (!res.ok) throw new Error(`conversation-engine returned ${res.status}`);

      const data = await res.json();

      setMessages((prev) => [...prev, { role: "assistant", text: data.reply }]);
      if (data.escalated) setEscalated(true);
    } catch (e) {
      console.error(e);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `Sorry, something went wrong. Please try again or call us at ${clinic?.phone || "the clinic"}.`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (initializing) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "640px",
          maxWidth: "480px",
          margin: "0 auto",
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: "var(--border-radius-lg)",
          color: "var(--color-text-secondary)",
          fontSize: "14px",
        }}
      >
        Loading clinic receptionist…
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "640px",
        maxWidth: "480px",
        margin: "0 auto",
        border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: "var(--border-radius-lg)",
        overflow: "hidden",
        background: "var(--color-background-primary)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <h2 className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>
        AI receptionist chat for {clinic?.name}
      </h2>

      <div
        style={{
          padding: "14px 16px",
          borderBottom: "0.5px solid var(--color-border-tertiary)",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          background: "var(--color-background-secondary)",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "var(--color-background-info)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-text-info)",
          }}
        >
          <i className="ti ti-dental" style={{ fontSize: 20 }} aria-hidden="true"></i>
        </div>
        <div>
          <p style={{ fontWeight: 500, fontSize: 15, margin: 0 }}>{clinic?.name}</p>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>
            AI receptionist · usually replies instantly
          </p>
        </div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              background: m.role === "user" ? "var(--color-background-info)" : "var(--color-background-secondary)",
              color: m.role === "user" ? "var(--color-text-info)" : "var(--color-text-primary)",
              padding: "8px 12px",
              borderRadius: "var(--border-radius-lg)",
              fontSize: "14px",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}
          >
            {m.text}
          </div>
        ))}

        {loading && (
          <div
            style={{
              alignSelf: "flex-start",
              background: "var(--color-background-secondary)",
              padding: "8px 12px",
              borderRadius: "var(--border-radius-lg)",
              fontSize: "14px",
              color: "var(--color-text-secondary)",
            }}
          >
            Typing…
          </div>
        )}

        {escalated && (
          <div
            style={{
              alignSelf: "stretch",
              background: "var(--color-background-warning)",
              color: "var(--color-text-warning)",
              padding: "8px 12px",
              borderRadius: "var(--border-radius-lg)",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <i className="ti ti-bell" style={{ fontSize: 16 }} aria-hidden="true"></i>
            A staff member has been notified and will follow up with you.
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: "8px", padding: "12px 16px", borderTop: "0.5px solid var(--color-border-tertiary)" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask about hours, services, pricing…"
          style={{ flex: 1 }}
          aria-label="Message"
        />
        <button onClick={send} disabled={loading} aria-label="Send message">
          <i className="ti ti-send" style={{ fontSize: 16 }} aria-hidden="true"></i>
        </button>
      </div>
    </div>
  );
}

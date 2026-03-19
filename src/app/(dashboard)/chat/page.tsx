"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Send, Bot, MessageSquare, Zap, Circle, Menu, X } from "lucide-react";

interface Agent {
  id: string;
  name: string;
  emoji: string;
  color: string;
  status: "online" | "offline";
}

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: number;
}

const QUICK_PROMPTS = [
  { label: "Daily brief", prompt: "Daily brief" },
  { label: "What did you do today?", prompt: "What did you do today?" },
  { label: "Status report", prompt: "Status report" },
  { label: "What can you do?", prompt: "What can you do?" },
];

function getStorageKey(agentId: string) {
  return `tenacitos-chat-${agentId}`;
}

function loadMessages(agentId: string): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getStorageKey(agentId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveMessages(agentId: string, messages: ChatMessage[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getStorageKey(agentId), JSON.stringify(messages));
  } catch {
    // storage full — silently fail
  }
}

export default function ChatPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch agents on mount
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await fetch("/api/agents");
        const data = await res.json();
        setAgents(data.agents || []);
      } catch (error) {
        console.error("Error fetching agents:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchAgents();
  }, []);

  // Load messages when agent changes
  useEffect(() => {
    if (selectedAgent) {
      setMessages(loadMessages(selectedAgent.id));
    }
  }, [selectedAgent]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const selectAgent = useCallback((agent: Agent) => {
    setSelectedAgent(agent);
    setSidebarOpen(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || !selectedAgent || sending) return;

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: text.trim(),
        timestamp: Date.now(),
      };

      const updated = [...messages, userMsg];
      setMessages(updated);
      saveMessages(selectedAgent.id, updated);
      setInput("");
      setSending(true);

      try {
        const command = `openclaw message send --agent ${selectedAgent.id} --channel telegram "${text.trim().replace(/"/g, '\\"')}"`;
        const res = await fetch("/api/terminal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command }),
        });
        const data = await res.json();

        const agentMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: "agent",
          content: data.output || data.error || "No response received.",
          timestamp: Date.now(),
        };

        const withResponse = [...updated, agentMsg];
        setMessages(withResponse);
        saveMessages(selectedAgent.id, withResponse);
      } catch (error) {
        const errMsg: ChatMessage = {
          id: `e-${Date.now()}`,
          role: "agent",
          content: `Error: ${error instanceof Error ? error.message : "Failed to send message"}`,
          timestamp: Date.now(),
        };
        const withError = [...updated, errMsg];
        setMessages(withError);
        saveMessages(selectedAgent.id, withError);
      } finally {
        setSending(false);
      }
    },
    [messages, selectedAgent, sending]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-pulse text-lg" style={{ color: "var(--text-muted)" }}>
            Loading agents...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        height: "calc(100vh - 40px)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden"
        style={{
          position: "absolute",
          top: "12px",
          left: "12px",
          zIndex: 40,
          background: "var(--surface-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "8px",
          color: "var(--text-primary)",
          cursor: "pointer",
        }}
      >
        {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div
          className="md:hidden"
          onClick={() => setSidebarOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 29,
          }}
        />
      )}

      {/* Agent Sidebar */}
      <div
        style={{
          width: "280px",
          minWidth: "280px",
          borderRight: "1px solid var(--border)",
          backgroundColor: "var(--surface)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: sidebarOpen ? "fixed" : undefined,
          top: sidebarOpen ? 0 : undefined,
          left: sidebarOpen ? 0 : undefined,
          bottom: sidebarOpen ? 0 : undefined,
          zIndex: sidebarOpen ? 30 : undefined,
        }}
        className={sidebarOpen ? "" : "hidden md:flex"}
      >
        {/* Sidebar header */}
        <div
          style={{
            padding: "16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-heading)",
              color: "var(--text-primary)",
              fontSize: "16px",
              fontWeight: 700,
              letterSpacing: "-0.5px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <MessageSquare className="w-5 h-5" style={{ color: "var(--accent)" }} />
            Agents ({agents.length})
          </h2>
        </div>

        {/* Agent list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
          {agents.map((agent) => {
            const isSelected = selectedAgent?.id === agent.id;
            return (
              <button
                key={agent.id}
                onClick={() => selectAgent(agent)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  backgroundColor: isSelected ? "var(--accent-soft)" : "transparent",
                  transition: "background-color 150ms ease",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = "var(--surface-hover)";
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <span style={{ fontSize: "22px", lineHeight: 1 }}>{agent.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      color: isSelected ? "var(--accent)" : "var(--text-primary)",
                      fontSize: "13px",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {agent.name}
                  </div>
                </div>
                <Circle
                  className="w-2.5 h-2.5 flex-shrink-0"
                  style={{
                    fill: agent.status === "online" ? "#4ade80" : "#6b7280",
                    color: agent.status === "online" ? "#4ade80" : "#6b7280",
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat Panel */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          backgroundColor: "var(--background)",
        }}
      >
        {selectedAgent ? (
          <>
            {/* Chat header */}
            <div
              style={{
                padding: "14px 20px",
                borderBottom: "1px solid var(--border)",
                backgroundColor: "var(--surface)",
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <span style={{ fontSize: "28px" }}>{selectedAgent.emoji}</span>
              <div>
                <h3
                  style={{
                    fontFamily: "var(--font-heading)",
                    color: "var(--text-primary)",
                    fontSize: "18px",
                    fontWeight: 700,
                    letterSpacing: "-0.5px",
                    margin: 0,
                  }}
                >
                  {selectedAgent.name}
                </h3>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Circle
                    className="w-2 h-2"
                    style={{
                      fill: selectedAgent.status === "online" ? "#4ade80" : "#6b7280",
                      color: selectedAgent.status === "online" ? "#4ade80" : "#6b7280",
                    }}
                  />
                  <span
                    style={{
                      fontSize: "12px",
                      color: selectedAgent.status === "online" ? "#4ade80" : "var(--text-muted)",
                    }}
                  >
                    {selectedAgent.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Messages area */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              {messages.length === 0 && (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "16px",
                    color: "var(--text-muted)",
                  }}
                >
                  <Bot className="w-16 h-16" style={{ opacity: 0.3 }} />
                  <p style={{ fontSize: "14px" }}>
                    Start a conversation with {selectedAgent.emoji} {selectedAgent.name}
                  </p>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    display: "flex",
                    justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "75%",
                      padding: "10px 14px",
                      borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                      backgroundColor:
                        msg.role === "user" ? "var(--accent)" : "var(--surface-elevated)",
                      color: msg.role === "user" ? "#fff" : "var(--text-primary)",
                      fontSize: "14px",
                      lineHeight: "1.5",
                      wordBreak: "break-word",
                    }}
                  >
                    <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
                    <div
                      style={{
                        fontSize: "10px",
                        marginTop: "4px",
                        opacity: 0.6,
                        textAlign: msg.role === "user" ? "right" : "left",
                      }}
                    >
                      {formatTime(msg.timestamp)}
                    </div>
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {sending && (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div
                    style={{
                      padding: "12px 18px",
                      borderRadius: "14px 14px 14px 4px",
                      backgroundColor: "var(--surface-elevated)",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span className="typing-dot" style={dotStyle(0)} />
                    <span className="typing-dot" style={dotStyle(1)} />
                    <span className="typing-dot" style={dotStyle(2)} />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick prompts */}
            <div
              style={{
                padding: "8px 20px 0",
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp.label}
                  onClick={() => sendMessage(qp.prompt)}
                  disabled={sending}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "20px",
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--surface)",
                    color: "var(--text-secondary)",
                    fontSize: "12px",
                    fontWeight: 500,
                    cursor: sending ? "not-allowed" : "pointer",
                    opacity: sending ? 0.5 : 1,
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    transition: "all 150ms ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!sending) {
                      e.currentTarget.style.backgroundColor = "var(--surface-hover)";
                      e.currentTarget.style.borderColor = "var(--accent)";
                      e.currentTarget.style.color = "var(--accent)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--surface)";
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }}
                >
                  <Zap className="w-3 h-3" />
                  {qp.label}
                </button>
              ))}
            </div>

            {/* Input bar */}
            <div
              style={{
                padding: "12px 20px 16px",
                display: "flex",
                gap: "10px",
                alignItems: "center",
              }}
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${selectedAgent.name}...`}
                disabled={sending}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--surface)",
                  color: "var(--text-primary)",
                  fontSize: "14px",
                  outline: "none",
                  fontFamily: "var(--font-body)",
                  transition: "border-color 150ms ease",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--accent)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || sending}
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "12px",
                  border: "none",
                  backgroundColor:
                    input.trim() && !sending ? "var(--accent)" : "var(--surface-elevated)",
                  color: input.trim() && !sending ? "#fff" : "var(--text-muted)",
                  cursor: input.trim() && !sending ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 150ms ease",
                  flexShrink: 0,
                }}
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </>
        ) : (
          /* No agent selected */
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "16px",
              color: "var(--text-muted)",
              padding: "20px",
            }}
          >
            <MessageSquare className="w-20 h-20" style={{ opacity: 0.15 }} />
            <h2
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "22px",
                fontWeight: 700,
                color: "var(--text-secondary)",
                letterSpacing: "-0.5px",
              }}
            >
              Agent Chat
            </h2>
            <p style={{ fontSize: "14px", textAlign: "center", maxWidth: "360px" }}>
              Select an agent from the sidebar to start a conversation. Messages are sent via the
              OpenClaw terminal.
            </p>
            <p className="md:hidden" style={{ fontSize: "13px", marginTop: "8px" }}>
              Tap the menu icon to see available agents.
            </p>
          </div>
        )}
      </div>

      {/* Typing animation keyframes */}
      <style jsx global>{`
        @keyframes typingBounce {
          0%, 60%, 100% {
            transform: translateY(0);
            opacity: 0.4;
          }
          30% {
            transform: translateY(-4px);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

function dotStyle(index: number): React.CSSProperties {
  return {
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    backgroundColor: "var(--text-muted)",
    display: "inline-block",
    animation: "typingBounce 1.2s ease-in-out infinite",
    animationDelay: `${index * 0.15}s`,
  };
}

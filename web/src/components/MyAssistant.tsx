/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { AssistantRuntimeProvider, useAui } from "@assistant-ui/react";
import {
  useAdkRuntime,
  createAdkStream,
  createAdkSessionAdapter,
} from "@assistant-ui/react-google-adk";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { multimodalAttachmentAdapter } from "@/components/assistant-ui/adapters/attachment-adapter";
import { authStore, useAuth } from "../auth/auth-store";

const ADK_API_URL = "/api/adk";
const ADK_APP_NAME = "app";

function AdkThreadSynchronizer({
  activeSessionId,
  activeAdkSessionId,
}: {
  activeSessionId: string;
  activeAdkSessionId?: string;
}) {
  const aui = useAui();
  const lastSyncedSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Only trigger thread switch when the selected web session changes (or on first mount if an existing ADK session ID is stored)
    const syncKey = `${activeSessionId}:${activeAdkSessionId ?? "new"}`;
    if (lastSyncedSessionIdRef.current === syncKey) return;
    lastSyncedSessionIdRef.current = syncKey;

    if (activeAdkSessionId) {
      aui.threads.switchToThread(activeAdkSessionId).catch(() => {
        // Backend session no longer exists (e.g. local in-memory server restarted); reset to a fresh thread
        authStore.setWebSessionAdkId(activeSessionId, undefined);
        aui.threads.switchToNewThread();
      });
    } else {
      aui.threads.switchToNewThread();
    }
  }, [aui, activeSessionId, activeAdkSessionId]);

  return null;
}

function AdkSessionRuntime({
  adkUserId,
  activeBusinessId,
  activeSessionId,
  activeAdkSessionId,
}: {
  adkUserId: string;
  activeBusinessId: string | null;
  activeSessionId: string;
  activeAdkSessionId?: string;
}) {
  const { sessionAdapter, load, stream } = useMemo(() => {
    const getAuthHeaders = (): Record<string, string> => {
      const current = authStore.getState();
      const headers: Record<string, string> = {};
      if (current.idToken) {
        headers["Authorization"] = `Bearer ${current.idToken}`;
      }
      if (current.activeBusinessId) {
        headers["X-Business-Id"] = current.activeBusinessId;
      }
      return headers;
    };
    const { adapter, load: loadFn } = createAdkSessionAdapter({
      apiUrl: ADK_API_URL,
      appName: ADK_APP_NAME,
      userId: adkUserId,
      headers: getAuthHeaders,
    });
    const streamFn = createAdkStream({
      api: ADK_API_URL,
      appName: ADK_APP_NAME,
      userId: adkUserId,
      headers: getAuthHeaders,
    });
    return { sessionAdapter: adapter, load: loadFn, stream: streamFn };
  }, [adkUserId, activeBusinessId]);

  const handleThreadIdChange = useCallback((remoteThreadId: string | undefined) => {
    if (!remoteThreadId) return;
    const current = authStore.getState();
    const alreadyBound = current.sessions.some((s) => s.adkSessionId === remoteThreadId);
    if (alreadyBound) return;
    const active = current.sessions.find((s) => s.id === current.activeSessionId);
    if (active && !active.adkSessionId) {
      authStore.setWebSessionAdkId(active.id, remoteThreadId);
    }
  }, []);

  const runtime = useAdkRuntime({
    stream,
    sessionAdapter,
    load,
    onThreadIdChange: handleThreadIdChange,
    adapters: {
      attachments: multimodalAttachmentAdapter,
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AdkThreadSynchronizer
        activeSessionId={activeSessionId}
        activeAdkSessionId={activeAdkSessionId}
      />
      <Thread />
    </AssistantRuntimeProvider>
  );
}

export function MyAssistant() {
  const auth = useAuth();
  const activeSession =
    auth.sessions.find((s) => s.id === auth.activeSessionId) || auth.sessions[0];
  const activeBusiness =
    auth.businesses.find((b) => b.id === auth.activeBusinessId) || auth.businesses[0] || null;

  const handleDeleteSession = async () => {
    const targetAdkSessionId = activeSession?.adkSessionId;
    const targetSessionId = auth.activeSessionId;
    authStore.deleteWebSession(targetSessionId);
    if (targetAdkSessionId) {
      try {
        const headers: Record<string, string> = {};
        if (auth.idToken) headers["Authorization"] = `Bearer ${auth.idToken}`;
        if (auth.activeBusinessId) headers["X-Business-Id"] = auth.activeBusinessId;
        await fetch(
          `${ADK_API_URL}/apps/${encodeURIComponent(ADK_APP_NAME)}/users/${encodeURIComponent(auth.activeAdkUserId)}/sessions/${encodeURIComponent(targetAdkSessionId)}`,
          { method: "DELETE", headers }
        );
      } catch {
        // Ignore network errors when cleaning up deleted test session
      }
    }
  };

  return (
    <div className="assistant-wrapper">
      <div className="assistant-header">
        <div className="assistant-header-top">
          <span className="assistant-header-title">
            ☕ {activeBusiness ? activeBusiness.name : "Virtual Assistant (Web Playground)"}
          </span>
          <span className="assistant-header-status">● Online</span>
        </div>

        <div className="assistant-session-toolbar">
          <div className="assistant-session-selector">
            <label htmlFor="web-session-select" className="session-label">
              🧪 Session:
            </label>
            <select
              id="web-session-select"
              className="session-select"
              value={auth.activeSessionId}
              onChange={(e) => authStore.selectWebSession(e.target.value)}
              title="Web test sessions (share the same ADK user to persist user:* preferences)"
            >
              {auth.sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} ({auth.isGuest ? "Guest" : "User"})
                </option>
              ))}
            </select>
          </div>

          <div className="assistant-session-actions">
            <button
              type="button"
              className="btn-new-session"
              onClick={() => authStore.createNewWebSession()}
              title="Create a new conversation session for the same user (keeps user:* preferences)"
            >
              + New Session
            </button>
            <button
              type="button"
              className="btn-new-user"
              onClick={() => authStore.createNewTestUser()}
              title="Create a fresh ADK test user (resets user:* preferences and sessions)"
            >
              👤 + New User
            </button>
            {auth.sessions.length > 1 && (
              <button
                type="button"
                className="btn-delete-session"
                onClick={handleDeleteSession}
                title="Delete this test session"
              >
                🗑
              </button>
            )}
          </div>
        </div>

        <div className="assistant-session-meta">
          <span className="session-id-pill" title="Shared user ID across web sessions in Google ADK">
            ADK User: <code>{auth.activeAdkUserId}</code>
          </span>
          <span className="session-id-pill" title="Current conversation session ID in Google ADK">
            ADK Session: <code>{activeSession?.adkSessionId ? activeSession.adkSessionId.slice(0, 8) : "new"}</code>
          </span>
          <span className="session-isolation-badge" title="Separated from WhatsApp wa_<phone> sessions">
            🔒 Isolated from WhatsApp
          </span>
        </div>
      </div>

      {/* Keyed by activeAdkUserId + activeBusinessId so switching businesses refreshes the active ADK context */}
      <div className="assistant-thread-container">
        <AdkSessionRuntime
          key={`${auth.activeAdkUserId}:${auth.activeBusinessId || "demo"}`}
          adkUserId={auth.activeAdkUserId}
          activeBusinessId={auth.activeBusinessId}
          activeSessionId={auth.activeSessionId}
          activeAdkSessionId={activeSession?.adkSessionId}
        />
      </div>
    </div>
  );
}

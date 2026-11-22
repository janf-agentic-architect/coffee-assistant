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
  activeSessionId,
  activeAdkSessionId,
}: {
  adkUserId: string;
  activeSessionId: string;
  activeAdkSessionId?: string;
}) {
  const { sessionAdapter, load, stream } = useMemo(() => {
    const { adapter, load: loadFn } = createAdkSessionAdapter({
      apiUrl: ADK_API_URL,
      appName: ADK_APP_NAME,
      userId: adkUserId,
    });
    const streamFn = createAdkStream({
      api: ADK_API_URL,
      appName: ADK_APP_NAME,
      userId: adkUserId,
    });
    return { sessionAdapter: adapter, load: loadFn, stream: streamFn };
  }, [adkUserId]);

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

  const handleDeleteSession = async () => {
    const targetAdkSessionId = activeSession?.adkSessionId;
    const targetSessionId = auth.activeSessionId;
    authStore.deleteWebSession(targetSessionId);
    if (targetAdkSessionId) {
      try {
        await fetch(
          `${ADK_API_URL}/apps/${encodeURIComponent(ADK_APP_NAME)}/users/${encodeURIComponent(auth.activeAdkUserId)}/sessions/${encodeURIComponent(targetAdkSessionId)}`,
          { method: "DELETE" }
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
          <span className="assistant-header-title">☕ Asistente Virtual (Playground Web)</span>
          <span className="assistant-header-status">● Online</span>
        </div>

        <div className="assistant-session-toolbar">
          <div className="assistant-session-selector">
            <label htmlFor="web-session-select" className="session-label">
              🧪 Sesión:
            </label>
            <select
              id="web-session-select"
              className="session-select"
              value={auth.activeSessionId}
              onChange={(e) => authStore.selectWebSession(e.target.value)}
              title="Sesiones de prueba en la web (comparten el mismo usuario ADK para persistir preferencias user:*)"
            >
              {auth.sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} ({auth.isGuest ? "Invitado" : "Usuario"})
                </option>
              ))}
            </select>
          </div>

          <div className="assistant-session-actions">
            <button
              type="button"
              className="btn-new-session"
              onClick={() => authStore.createNewWebSession()}
              title="Crear una nueva sesión de conversación para el mismo usuario (conserva preferencias user:*)"
            >
              + Nueva Sesión
            </button>
            <button
              type="button"
              className="btn-new-user"
              onClick={() => authStore.createNewTestUser()}
              title="Crear un nuevo usuario de prueba limpio en ADK (reinicia preferencias user:* y sesiones)"
            >
              👤 + Nuevo Usuario
            </button>
            {auth.sessions.length > 1 && (
              <button
                type="button"
                className="btn-delete-session"
                onClick={handleDeleteSession}
                title="Eliminar esta sesión de prueba"
              >
                🗑
              </button>
            )}
          </div>
        </div>

        <div className="assistant-session-meta">
          <span className="session-id-pill" title="ID de usuario compartido entre sesiones web en Google ADK">
            Usuario ADK: <code>{auth.activeAdkUserId}</code>
          </span>
          <span className="session-id-pill" title="ID de sesión de conversación actual en Google ADK">
            Sesión ADK: <code>{activeSession?.adkSessionId ? activeSession.adkSessionId.slice(0, 8) : "nueva"}</code>
          </span>
          <span className="session-isolation-badge" title="Separado de las sesiones wa_<telefono> de WhatsApp">
            🔒 Aislado de WhatsApp
          </span>
        </div>
      </div>

      {/* Keyed by activeAdkUserId so all web sessions of the same user share one ADK user_id */}
      <div className="assistant-thread-container">
        <AdkSessionRuntime
          key={auth.activeAdkUserId}
          adkUserId={auth.activeAdkUserId}
          activeSessionId={auth.activeSessionId}
          activeAdkSessionId={activeSession?.adkSessionId}
        />
      </div>
    </div>
  );
}

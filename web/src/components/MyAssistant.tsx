/** @jsxImportSource react */
import { useMemo } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
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

function AdkSessionRuntime({ adkUserId }: { adkUserId: string }) {
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

  const runtime = useAdkRuntime({
    stream,
    sessionAdapter,
    load,
    adapters: {
      attachments: multimodalAttachmentAdapter,
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread />
    </AssistantRuntimeProvider>
  );
}

export function MyAssistant() {
  const auth = useAuth();

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
              title="Sesiones de prueba en la web (aisladas de WhatsApp wa_*)"
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
              title="Crear una nueva sesión de prueba limpia en la web"
            >
              + Nueva Sesión
            </button>
            {auth.sessions.length > 1 && (
              <button
                type="button"
                className="btn-delete-session"
                onClick={() => authStore.deleteWebSession(auth.activeSessionId)}
                title="Eliminar esta sesión de prueba"
              >
                🗑
              </button>
            )}
          </div>
        </div>

        <div className="assistant-session-meta">
          <span className="session-id-pill" title="ID de usuario enviado a Google ADK">
            ID ADK: <code>{auth.activeAdkUserId}</code>
          </span>
          <span className="session-isolation-badge" title="Separado de las sesiones wa_<telefono> de WhatsApp">
            🔒 Aislado de WhatsApp
          </span>
        </div>
      </div>

      {/* Keyed by activeAdkUserId so switching or creating a test session mounts a clean ADK runtime */}
      <div className="assistant-thread-container">
        <AdkSessionRuntime key={auth.activeAdkUserId} adkUserId={auth.activeAdkUserId} />
      </div>
    </div>
  );
}

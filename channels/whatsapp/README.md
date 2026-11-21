# Canal WhatsApp Cloud API (Multimodal) para Google ADK

Este microservicio conecta **WhatsApp Cloud API (Meta)** con el asistente conversacional basado en **Google Agent Development Kit (ADK)**, permitiendo a los usuarios interactuar a través de WhatsApp mediante:

- 💬 **Texto**: Conversación estándar por chat.
- 🖼️ **Imágenes**: Fotos y capturas con análisis visual de Gemini (con o sin pie de foto/caption).
- 🎙️ **Notas de voz y Audios**: Transcripción y comprensión auditiva nativa (`audio/ogg`, `audio/mp4`, `audio/mpeg`, etc.).
- 📄 **Documentos**: Documentos compatibles procesados como entrada multimodal.

---

## 🏗️ Arquitectura y Flujo

```
                    ┌─────────────────────────┐
                    │    WhatsApp Client      │
                    │   (iOS / Android / Web) │
                    └────────────┬────────────┘
                                 │
                                 ▼
                     Meta WhatsApp Cloud API
                                 │
                 Webhook POST    │
                 (JSON Payload)  ▼
                    ┌─────────────────────────┐
                    │  channels/whatsapp      │
                    │  (FastAPI Microservice) │
                    │                         │
                    │  1. Responde 200 OK     │
                    │  2. Descarga Media      │
                    │     (Meta Graph API)    │
                    │  3. Formatea Multimodal │
                    │     (Base64 inline_data)│
                    └────────────┬────────────┘
                                 │
                                 ▼ HTTP POST /run (ADK API Server)
                    ┌─────────────────────────┐
                    │ Google ADK Agent Server │
                    │ (chat_assistant/Gemini) │
                    └────────────┬────────────┘
                                 │
                                 ▼ Respuesta texto
                    ┌─────────────────────────┐
                    │ WhatsApp Cloud API      │
                    │ POST /messages          │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │    WhatsApp Client      │
                    └─────────────────────────┘
```

1. **Meta Webhook Handshake**: Implementa el endpoint `GET /webhook` validando `hub.verify_token` y devolviendo el challenge exigido por Meta.
2. **Recepción Asíncrona Inmediata**: Al recibir un `POST /webhook`, responde de inmediato con `HTTP 200 OK` y procesa la descarga de medios e inferencia en `BackgroundTasks` para evitar timeouts o reintentos de Meta.
3. **Descarga de Medios**: Si el mensaje contiene imagen o audio, obtiene la URL de descarga autenticada desde Graph API y descarga los bytes.
4. **Conversión a ADK Multimodal**: Transforma los datos binarios en objetos `types.Content` de ADK (`{"inline_data": {"mime_type": "...", "data": "<base64>"}}`).
5. **Sesiones Persistentes**: Mapea automáticamente el número de teléfono del usuario a una sesión de ADK (`wa_{phone_number}`), manteniendo el contexto de la conversación.

---

## ⚙️ Requisitos Previos

1. Cuenta de desarrollador en [Meta for Developers](https://developers.facebook.com/).
2. Una aplicación de WhatsApp Cloud API configurada en Meta con:
   - **Access Token** (`whatsapp_token`): temporal o permanente (System User).
   - **App Secret** (`whatsapp_app_secret`): para validación de firma `X-Hub-Signature-256` y registro automático del Callback URL en Meta.
   - *(Opcional)* **Phone Number ID**, **WABA ID** y **Verify Token**: se autodescubren y autogeneran automáticamente si se omiten.
3. El servidor de ADK corriendo localmente (por defecto en `http://localhost:8080` mediante `make dev-agent-api`) o desplegado en Vertex AI Agent Runtime.

---

## 🚀 Puesta en Marcha

### 1. Instalar Dependencias
Desde la raíz o dentro del directorio `channels`:

```bash
cd channels
uv sync
```

### 2. Configurar Credenciales (vía `infra/vars/env.tfvars`)
En lugar de gestionar múltiples secretos manualmente, agrega únicamente `whatsapp_token` y `whatsapp_app_secret` en `infra/vars/env.tfvars`:

```hcl
whatsapp_token      = "EAAG..."
whatsapp_app_secret = "tu_app_secret_de_meta"
```

- **En producción (`make infra` + `make deploy-whatsapp`)**:
  - Terraform guarda automáticamente `whatsapp-token` y `whatsapp-app-secret` en **GCP Secret Manager**.
  - Terraform genera automáticamente un `whatsapp-verify-token` aleatorio de 32 caracteres en **GCP Secret Manager**.
  - El `Phone Number ID` y el `WABA ID` se **autodescubren automáticamente** desde Meta Graph API (`/debug_token` y `/{WABA_ID}/phone_numbers`) y desde los webhooks entrantes.
  - Al terminar `make deploy-whatsapp`, se registra automáticamente la URL de Cloud Run y el `Verify Token` en tu App de Meta (`/{APP_ID}/subscriptions`) y se suscribe el WABA (`/{WABA_ID}/subscribed_apps`).
- **En desarrollo local (`make dev-whatsapp`)**:
  - `channels/whatsapp/config.py` lee automáticamente `whatsapp_token` y `whatsapp_app_secret` desde `infra/vars/env.tfvars` como fallback si no están definidos en `channels/whatsapp/.env`.

### 3. Iniciar los Servicios

**Terminal 1: Iniciar el backend local de ADK (`http://localhost:8080`)**
```bash
make dev-agent-api
```

**Terminal 2: Iniciar el canal de WhatsApp + ngrok + auto-registro en Meta**
```bash
make dev-whatsapp-tunnel
```
> `make dev-whatsapp-tunnel` levanta el servidor FastAPI en el puerto `8001`, abre el túnel HTTPS con `ngrok`, detecta automáticamente la URL pública desde `http://127.0.0.1:4040/api/tunnels`, autodescubre el `App ID` y `WABA ID`, registra el Callback URL en la App de Meta y suscribe el WABA al evento `messages`.

También puedes ejecutar los pasos por separado:
- `make dev-whatsapp`: Inicia el servidor webhook en el puerto 8001.
- `make tunnel-whatsapp`: Expone el puerto 8001 con ngrok.
- `make subscribe-whatsapp-waba`: Autodescubre WABA, registra el webhook y suscribe los eventos.

---

## 🌐 Configuración del Webhook en Meta (Automática vs. Manual)

### Opción A: Automática (Recomendada)
Con `whatsapp_token` y `whatsapp_app_secret` definidos en `infra/vars/env.tfvars`:
- **En Cloud Run**: `make deploy-whatsapp` registra automáticamente la URL de Cloud Run y el `WHATSAPP_VERIFY_TOKEN` generado por Terraform en tu App de Meta (`/{APP_ID}/subscriptions`) y suscribe tu WABA (`/{WABA_ID}/subscribed_apps`).
- **En Desarrollo Local**: `make dev-whatsapp-tunnel` detecta el túnel activo de `ngrok` (`--auto-ngrok`) y actualiza automáticamente el Callback URL en Meta.

### Opción B: Manual en el Panel de Meta
Si prefieres configurar el webhook manualmente en el panel de **Meta for Developers**:
1. Dirígete a **WhatsApp** > **Configuración** > **Webhook**.
2. Haz clic en **Editar**.
3. **URL de devolución de llamada**: `https://tu-dominio/webhooks/whatsapp` (también se admiten `/webhook`, `/webhook/whatsapp` o `/whatsapp/webhook`).
4. **Identificador de verificación (Verify Token)**: El valor de `WHATSAPP_VERIFY_TOKEN` (por defecto en local `coffee_assistant_verify_token`, o en Cloud Run el output `terraform -chdir=infra output -raw whatsapp_verify_token`).
5. Haz clic en **Verificar y guardar**.
6. En los campos de suscripción de Webhook, activa **`messages`**.

---

## 🧪 Pruebas Locales (Curl)

### Probar Handshake de Verificación (GET):
```bash
curl -X GET "http://localhost:8001/webhook?hub.mode=subscribe&hub.verify_token=mi_token_secreto_adk&hub.challenge=1158201444"
```
Debe responder con `1158201444` y código 200.

### Probar Mensaje de Texto (POST Simulado):
```bash
curl -X POST "http://localhost:8001/webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "12345",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": {"display_phone_number": "123456", "phone_number_id": "123456789012345"},
          "contacts": [{"wa_id": "5215512345678", "profile": {"name": "Usuario"}}],
          "messages": [{
            "from": "5215512345678",
            "id": "wamid.HBgL...",
            "timestamp": "1700000000",
            "type": "text",
            "text": {"body": "Hola, ¿cómo estás?"}
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```
Debe responder inmediatamente `{"status": "ok"}` con código 200.

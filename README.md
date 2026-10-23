# manicura-api
Servidor REST de citas de manicura para una sola manicurista: clientes, calendario, citas sin solapamiento y recordatorios WhatsApp preparados.

## Requisitos
Node.js 20+, PostgreSQL y un cliente HTTP. Usa `npm install`; copia `.env.example` a `.env` y completa `DATABASE_URL`, `ADMIN_API_KEY` (mínimo 24 caracteres). Inicia con `npm start`. El esquema se crea automáticamente.

## API
`GET /health` público. Los demás endpoints requieren encabezado `X-API-Key: <ADMIN_API_KEY>`.
- `POST /api/clients` JSON `{"name":"Ana","phone":"+50688888888","whatsapp_opt_in":true}`
- `GET /api/clients`
- `PATCH /api/clients/:id` JSON con campos `name`, `phone`, `notes`, `whatsapp_opt_in`
- `POST /api/appointments` JSON `{"client_id":1,"service":"Manicura","starts_at":"2026-11-01T09:00:00-06:00","ends_at":"2026-11-01T10:00:00-06:00"}`
- `GET /api/appointments?from=2026-11-01T00:00:00-06:00&to=2026-11-02T00:00:00-06:00` (codifica `+` como `%2B` en URLs)
- `PATCH /api/appointments/:id/status` JSON `{"status":"cancelled"}`; valores: confirmed, cancelled, completed.

## Publicar HTTPS en Render
1. Crea repositorio PRIVADO en GitHub y sube el contenido de esta carpeta (no el archivo .env).
2. Abre Render > New > Blueprint y selecciona el repositorio. Render leerá `render.yaml` y creará el servicio web, PostgreSQL y el cron de recordatorios. Confirma los planes y sus precios antes de desplegar.
3. Configura `CORS_ORIGIN` con el origen de tu interfaz web, o deja vacío si solo usarás apps móviles nativas.
4. Espera despliegue exitoso, luego abre `https://TU-SERVICIO.onrender.com/health`.
5. Render genera `ADMIN_API_KEY`. Consulta su valor desde las variables del servicio y guárdalo en un administrador de secretos. No incluyas esa clave en una app móvil distribuida: la clave maestra es SOLO para el servidor/panel administrativo confiable. Antes de publicar clientes móviles se requiere implementar inicio de sesión seguro con usuarios y permisos.

## WhatsApp
Se requiere cuenta WhatsApp Business Platform / Cloud API, número habilitado, token de acceso y plantilla aprobada `recordatorio_cita` en idioma `es` con dos variables en el cuerpo en este orden: servicio, fecha y hora. Configura `WA_ACCESS_TOKEN` y `WA_PHONE_NUMBER_ID` como secretos del cron en Render. Solo se intenta enviar a clientes con `whatsapp_opt_in=true`. El cron se ejecuta cada 15 minutos (zona horaria de Render: UTC), selecciona citas cuya hora de inicio está entre 23 h 45 min y 24 h después del momento de ejecución y marca el resultado. No envía mensajes hasta completar la configuración.

## Alcance y límites
Esta es una API administrativa inicial, no la interfaz visual ni una app instalable. Soporta una sola agenda y evita conflictos al crear citas; para editar horarios hay que cancelar y crear otra cita. La autenticación es una clave administrativa compartida; no se debe exponer a clientes móviles. El cron es una primera implementación: si ocurre una caída o un envío queda en estado `processing` puede requerir reconciliación manual; los reintentos y los webhooks de entrega deben robustecerse para producción. Para pruebas locales ejecuta `npm run reminders` con variables configuradas.

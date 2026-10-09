/** Identifica esta pestaña ante el backend (cabecera X-Client-Id) para que no reaccione a sus propios cambios. */
export const CLIENT_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);

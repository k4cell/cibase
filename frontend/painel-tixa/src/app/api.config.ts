// Endereço do backend. Hoje aponta pro uvicorn rodando local; quando o
// backend for publicado (ex: Render), essa é a única linha que precisa
// mudar, em vez de editar cada chamada http espalhada pelo app.ts.
export const API_BASE_URL = 'http://127.0.0.1:8000';

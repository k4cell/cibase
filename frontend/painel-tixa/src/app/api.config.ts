import { environment } from '../environments/environment';

// Endereço do backend. Em desenvolvimento (npm start) aponta pro uvicorn
// local; em produção (ng build) aponta pro Render -- a troca é automática,
// feita pelo Angular via fileReplacements (veja angular.json), não daqui.
export const API_BASE_URL = environment.apiBaseUrl;

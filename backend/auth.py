from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import firebase_admin
from firebase_admin import credentials as firebase_credentials, auth as firebase_auth

# ==============================================================================
# AUTENTICAÇÃO (FIREBASE)
# ==============================================================================
# Inicializa o Admin SDK uma vez, na subida do servidor. O arquivo é secreto
# (dá poder de administrador sobre o projeto Firebase) -- por isso vive só no
# disco local e está no .gitignore, nunca commitado.
_credencial_firebase = firebase_credentials.Certificate("firebase-service-account.json")
firebase_admin.initialize_app(_credencial_firebase)

_esquema_bearer = HTTPBearer()


def verificar_token(credenciais: HTTPAuthorizationCredentials = Depends(_esquema_bearer)) -> dict:
    """
    Roda em TODA rota da API (aplicada globalmente no FastAPI(...), em main.py).
    Confere se o token que o Angular mandou no header Authorization foi
    realmente emitido pelo Firebase pra este projeto, e se ainda não expirou.
    Se passar, devolve os dados do usuário (uid, email); se não, barra a
    requisição com 401 antes mesmo dela chegar na rota.
    """
    try:
        return firebase_auth.verify_id_token(credenciais.credentials)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido ou expirado.")

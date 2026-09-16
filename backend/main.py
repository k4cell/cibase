from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from auth import verificar_token
from routers import clientes, configuracoes, importacao, motor, servicos, vendas

# ==============================================================================
# CONFIGURAÇÕES INICIAIS DA API (MOTOR TIXA)
# ==============================================================================
app = FastAPI(
    title="Motor Backend - Projeto Tixa",
    version="0.13.0",
    dependencies=[Depends(verificar_token)]  # exige token válido em toda rota
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(configuracoes.router)
app.include_router(servicos.router)
app.include_router(clientes.router)
app.include_router(vendas.router)
app.include_router(importacao.router)
app.include_router(motor.router)

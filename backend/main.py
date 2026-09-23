from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import clientes, configuracoes, importacao, motor, servicos, vendas

# ==============================================================================
# CONFIGURAÇÕES INICIAIS DA API (MOTOR CIBASE)
# ==============================================================================
# O token do Firebase agora é exigido em cada router individualmente (veja
# routers/*.py: APIRouter(dependencies=[Depends(verificar_token)])), não mais
# aqui no app inteiro -- assim dá pra ter uma rota pública, como o /healthz
# abaixo, que serviços de monitoramento (Render) conseguem checar sem token.
app = FastAPI(
    title="Motor Backend - CiBase",
    version="0.25.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/healthz")
def verificar_saude():
    """ Rota pública (sem exigir token) só pra serviços de monitoramento
    confirmarem que o processo está de pé -- não expõe nenhum dado. """
    return {"status": "ok"}

app.include_router(configuracoes.router)
app.include_router(servicos.router)
app.include_router(clientes.router)
app.include_router(vendas.router)
app.include_router(importacao.router)
app.include_router(motor.router)

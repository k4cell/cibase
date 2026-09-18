from fastapi import APIRouter, Depends

from auth import verificar_token
from database import conectar_banco
from models import ConfiguracoesAtualizacao

router = APIRouter(dependencies=[Depends(verificar_token)])

# ==============================================================================
# CONFIGURAÇÕES DO NEGÓCIO (régua de relacionamento / farol de risco)
# ==============================================================================
@router.get("/configuracoes")
def obter_configuracoes():
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()
        cursor.execute("SELECT dias_atencao, dias_risco FROM configuracoes ORDER BY id LIMIT 1;")
        linha = cursor.fetchone()
        cursor.close()
        conexao.close()

        if not linha:
            return {"dias_atencao": 30, "dias_risco": 90}
        return {"dias_atencao": linha[0], "dias_risco": linha[1]}
    except Exception as erro:
        return {"erro": f"Erro ao buscar configurações: {erro}"}

@router.put("/configuracoes")
def atualizar_configuracoes(config: ConfiguracoesAtualizacao):
    if config.dias_atencao <= 0 or config.dias_risco <= 0:
        return {"erro": "Os prazos precisam ser maiores que zero."}
    if config.dias_atencao >= config.dias_risco:
        return {"erro": "O prazo de 'Atenção' precisa ser menor que o de 'Risco Alto'."}

    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()

        cursor.execute("SELECT id FROM configuracoes ORDER BY id LIMIT 1;")
        linha = cursor.fetchone()

        if linha:
            cursor.execute(
                "UPDATE configuracoes SET dias_atencao = %s, dias_risco = %s WHERE id = %s;",
                (config.dias_atencao, config.dias_risco, linha[0])
            )
        else:
            cursor.execute(
                "INSERT INTO configuracoes (dias_atencao, dias_risco) VALUES (%s, %s);",
                (config.dias_atencao, config.dias_risco)
            )

        conexao.commit()
        cursor.close()
        conexao.close()
        return {"mensagem": "Configurações atualizadas com sucesso!"}
    except Exception as erro:
        return {"erro": f"Erro ao atualizar configurações: {erro}"}

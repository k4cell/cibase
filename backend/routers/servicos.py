import psycopg2
from fastapi import APIRouter, Depends

from auth import verificar_token
from database import conectar_banco
from models import MensagemModelo, NovoServico

router = APIRouter(dependencies=[Depends(verificar_token)])

LIMITE_MENSAGEM_MODELO = 1000


def _limpar_mensagem_modelo(texto: str | None) -> str | None:
    """ Vazio vira NULL (= volta a usar a mensagem padrão do motor). """
    texto = (texto or "").strip()
    return texto or None

# ==============================================================================
# CATÁLOGO DE SERVIÇOS (motor de recomendação: unidade = cliente + serviço)
# ==============================================================================
@router.get("/servicos")
def listar_servicos():
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()
        cursor.execute("SELECT id, nome, dias_ciclo, unidade_ciclo, mensagem_modelo FROM servicos ORDER BY nome;")
        linhas = cursor.fetchall()
        cursor.close()
        conexao.close()
        return {"servicos": [
            {"id": l[0], "nome": l[1], "dias_ciclo": l[2], "unidade_ciclo": l[3] or "dias", "mensagem_modelo": l[4]}
            for l in linhas
        ]}
    except Exception as erro:
        return {"erro": f"Erro ao buscar serviços: {erro}"}

@router.post("/servicos")
def criar_servico(servico: NovoServico):
    nome = servico.nome.strip()
    if not nome:
        return {"erro": "O nome do serviço não pode ficar em branco."}
    if servico.dias_ciclo <= 0:
        return {"erro": "O ciclo esperado precisa ser maior que zero."}

    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()
        cursor.execute(
            "INSERT INTO servicos (nome, dias_ciclo, unidade_ciclo) VALUES (%s, %s, %s) RETURNING id;",
            (nome, servico.dias_ciclo, servico.unidade_ciclo)
        )
        novo_id = cursor.fetchone()[0]
        conexao.commit()
        cursor.close()
        conexao.close()
        return {"mensagem": "Serviço cadastrado com sucesso!", "id": novo_id}
    except psycopg2.errors.UniqueViolation:
        return {"erro": f"Já existe um serviço chamado '{nome}'."}
    except Exception as erro:
        return {"erro": f"Erro ao cadastrar serviço: {erro}"}

@router.put("/servicos/{servico_id}")
def atualizar_servico(servico_id: int, servico: NovoServico):
    nome = servico.nome.strip()
    if not nome:
        return {"erro": "O nome do serviço não pode ficar em branco."}
    if servico.dias_ciclo <= 0:
        return {"erro": "O ciclo esperado precisa ser maior que zero."}

    campos = ["nome = %s", "dias_ciclo = %s", "unidade_ciclo = %s"]
    valores = [nome, servico.dias_ciclo, servico.unidade_ciclo]
    if "mensagem_modelo" in servico.model_fields_set:
        mensagem = _limpar_mensagem_modelo(servico.mensagem_modelo)
        if mensagem and len(mensagem) > LIMITE_MENSAGEM_MODELO:
            return {"erro": f"A mensagem pode ter no máximo {LIMITE_MENSAGEM_MODELO} caracteres."}
        campos.append("mensagem_modelo = %s")
        valores.append(mensagem)

    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()
        cursor.execute(f"UPDATE servicos SET {', '.join(campos)} WHERE id = %s;", (*valores, servico_id))
        linhas_afetadas = cursor.rowcount
        conexao.commit()
        cursor.close()
        conexao.close()

        if linhas_afetadas == 0: return {"erro": "Serviço não encontrado."}
        return {"mensagem": "Serviço atualizado com sucesso!"}
    except psycopg2.errors.UniqueViolation:
        return {"erro": f"Já existe um serviço chamado '{nome}'."}
    except Exception as erro:
        return {"erro": f"Erro ao atualizar serviço: {erro}"}

@router.put("/servicos/{servico_id}/mensagem")
def salvar_mensagem_modelo(servico_id: int, corpo: MensagemModelo):
    """ Salva só a mensagem-modelo do serviço (usada pelo "Salvar como modelo"
    da fila de hoje, que não tem nome/ciclo à mão pra mandar no PUT completo). """
    mensagem = _limpar_mensagem_modelo(corpo.mensagem_modelo)
    if mensagem and len(mensagem) > LIMITE_MENSAGEM_MODELO:
        return {"erro": f"A mensagem pode ter no máximo {LIMITE_MENSAGEM_MODELO} caracteres."}

    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()
        cursor.execute("UPDATE servicos SET mensagem_modelo = %s WHERE id = %s;", (mensagem, servico_id))
        linhas_afetadas = cursor.rowcount
        conexao.commit()
        cursor.close()
        conexao.close()

        if linhas_afetadas == 0: return {"erro": "Serviço não encontrado."}
        return {"mensagem": "Mensagem salva!", "mensagem_modelo": mensagem}
    except Exception as erro:
        return {"erro": f"Erro ao salvar a mensagem: {erro}"}

@router.delete("/servicos/{servico_id}")
def excluir_servico(servico_id: int):
    """ Só apaga se nenhuma venda usa esse serviço -- a FK de vendas.servico_id
    não tem CASCADE, então tentar apagar um serviço em uso já falharia sozinho;
    aqui só transformamos isso numa mensagem legível em vez de erro de banco. """
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()
        cursor.execute("SELECT COUNT(*) FROM vendas WHERE servico_id = %s;", (servico_id,))
        em_uso = cursor.fetchone()[0]
        if em_uso > 0:
            cursor.close()
            conexao.close()
            texto_vendas = "1 venda registrada" if em_uso == 1 else f"{em_uso} vendas registradas"
            return {"erro": f"Esse serviço tem {texto_vendas} e não pode ser excluído."}

        cursor.execute("DELETE FROM servicos WHERE id = %s;", (servico_id,))
        linhas_afetadas = cursor.rowcount
        conexao.commit()
        cursor.close()
        conexao.close()

        if linhas_afetadas == 0: return {"erro": "Serviço não encontrado."}
        return {"mensagem": "Serviço excluído com sucesso!"}
    except Exception as erro:
        return {"erro": f"Erro ao excluir serviço: {erro}"}

from datetime import datetime

from fastapi import APIRouter

from database import conectar_banco
from models import NovoCliente, AdiarContato, AlternarFlag

router = APIRouter()

# ==============================================================================
# ROTAS DE CLIENTES
# ==============================================================================
def _buscar_clientes(ativo: bool):
    conexao = conectar_banco()
    cursor = conexao.cursor()

    comando_sql = """
        SELECT
            c.id, c.nome, c.telefone, c.cpf, c.email, c.data_nascimento,
            MAX(v.data_da_venda) AS ultima_compra,
            COALESCE(SUM(v.valor), 0) AS valor_recuperado,
            COUNT(v.id) AS total_compras,
            c.proximo_contato_em
        FROM clientes c
        LEFT JOIN vendas v ON c.id = v.cliente_id
        WHERE c.ativo = %s
        GROUP BY c.id, c.nome, c.telefone, c.cpf, c.email, c.data_nascimento, c.proximo_contato_em
        ORDER BY c.id;
    """
    cursor.execute(comando_sql, (ativo,))
    clientes_do_banco = cursor.fetchall()
    cursor.close()
    conexao.close()

    return [
        {
            "id": cliente[0],
            "nome": cliente[1],
            "telefone": cliente[2],
            "cpf": cliente[3] if cliente[3] else "Não informado",
            "email": cliente[4] if cliente[4] else "Não informado",
            "data_nascimento": str(cliente[5]) if cliente[5] else "Não informado",
            "ultima_compra": str(cliente[6]) if cliente[6] else "Sem vendas",
            "valor_recuperado": float(cliente[7]),
            "total_compras": int(cliente[8]),
            "proximo_contato_em": str(cliente[9]) if cliente[9] else None
        }
        for cliente in clientes_do_banco
    ]

@router.get("/clientes")
def listar_clientes():
    try:
        return {"clientes": _buscar_clientes(ativo=True)}
    except Exception as erro:
        return {"erro": f"Falha na comunicação com o banco de dados: {erro}"}

@router.get("/clientes/arquivados")
def listar_clientes_arquivados():
    try:
        return {"clientes": _buscar_clientes(ativo=False)}
    except Exception as erro:
        return {"erro": f"Falha na comunicação com o banco de dados: {erro}"}

@router.get("/clientes/{cliente_id}/vendas")
def listar_vendas_do_cliente(cliente_id: int):
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()

        cursor.execute(
            """
            SELECT v.id, v.valor, v.data_da_venda, s.nome
            FROM vendas v
            LEFT JOIN servicos s ON s.id = v.servico_id
            WHERE v.cliente_id = %s
            ORDER BY v.data_da_venda DESC, v.id DESC;
            """,
            (cliente_id,)
        )
        vendas_do_banco = cursor.fetchall()
        cursor.close()
        conexao.close()

        vendas_formatadas = [
            {
                "id": venda[0],
                "valor": float(venda[1]),
                "data_da_venda": str(venda[2]),
                "servico": venda[3] or "Não informado"
            }
            for venda in vendas_do_banco
        ]
        return {"vendas": vendas_formatadas}
    except Exception as erro:
        return {"erro": f"Falha ao buscar vendas do cliente: {erro}"}

@router.post("/clientes")
def criar_cliente(cliente: NovoCliente):
    try:
        if cliente.data_nascimento and cliente.data_nascimento != "Não informado":
            try:
                data_nasc_obj = datetime.strptime(cliente.data_nascimento, "%Y-%m-%d").date()
                hoje = datetime.now().date()
                if data_nasc_obj > hoje: return {"erro": "A data de nascimento não pode estar no futuro!"}
                if data_nasc_obj.year < 1945: return {"erro": "O ano de nascimento não pode ser anterior a 1945!"}
            except ValueError:
                return {"erro": "Formato de data inválido! Use YYYY-MM-DD."}

        conexao = conectar_banco()
        cursor = conexao.cursor()

        cursor.execute("SELECT id FROM clientes WHERE cpf = %s;", (cliente.cpf,))
        if cursor.fetchone():
            cursor.close()
            conexao.close()
            return {"erro": "Este CPF já está cadastrado no sistema!"}

        comando_sql = "INSERT INTO clientes (nome, telefone, cpf, email, data_nascimento) VALUES (%s, %s, %s, %s, %s);"
        cursor.execute(comando_sql, (cliente.nome, cliente.telefone, cliente.cpf, cliente.email, cliente.data_nascimento))

        conexao.commit()
        cursor.close()
        conexao.close()
        return {"mensagem": "Cliente cadastrado com sucesso!"}
    except Exception as erro:
        return {"erro": f"Erro interno ao inserir cliente: {erro}"}

@router.put("/clientes/{cliente_id}")
def atualizar_cliente(cliente_id: int, cliente: NovoCliente):
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()

        cursor.execute("SELECT id FROM clientes WHERE cpf = %s AND id != %s;", (cliente.cpf, cliente_id))
        if cursor.fetchone():
            cursor.close()
            conexao.close()
            return {"erro": "Este CPF já pertence a outro cliente!"}

        comando_sql = "UPDATE clientes SET nome = %s, telefone = %s, cpf = %s, email = %s, data_nascimento = %s WHERE id = %s;"
        cursor.execute(comando_sql, (cliente.nome, cliente.telefone, cliente.cpf, cliente.email, cliente.data_nascimento, cliente_id))

        linhas_afetadas = cursor.rowcount
        conexao.commit()
        cursor.close()
        conexao.close()

        if linhas_afetadas == 0: return {"erro": "Cliente não encontrado para edição."}
        return {"mensagem": "Cliente atualizado com sucesso!"}
    except Exception as erro:
        return {"erro": f"Erro interno ao atualizar cliente: {erro}"}

@router.delete("/clientes/{cliente_id}")
def arquivar_cliente(cliente_id: int):
    """
    Arquivamento lógico: marca ativo = FALSE em vez de apagar a linha.
    Preserva o histórico de vendas (a FK vendas.cliente_id não tem CASCADE).
    """
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()

        comando_sql = "UPDATE clientes SET ativo = FALSE WHERE id = %s AND ativo = TRUE;"
        cursor.execute(comando_sql, (cliente_id,))

        linhas_afetadas = cursor.rowcount
        conexao.commit()
        cursor.close()
        conexao.close()

        if linhas_afetadas == 0: return {"erro": "Cliente não encontrado ou já arquivado."}
        return {"mensagem": "Cliente arquivado com sucesso!"}
    except Exception as erro:
        return {"erro": str(erro)}

@router.put("/clientes/{cliente_id}/adiar")
def adiar_contato(cliente_id: int, dados: AdiarContato):
    """
    Empurra proximo_contato_em pra frente: o cliente some da fila de hoje até
    essa data, sem mudar status nem histórico -- só quando ele pode reaparecer.
    """
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()

        comando_sql = """
            UPDATE clientes
            SET proximo_contato_em = CURRENT_DATE + make_interval(days => %s)
            WHERE id = %s AND ativo = TRUE;
        """
        cursor.execute(comando_sql, (dados.dias, cliente_id))

        linhas_afetadas = cursor.rowcount
        conexao.commit()
        cursor.close()
        conexao.close()

        if linhas_afetadas == 0: return {"erro": "Cliente não encontrado ou arquivado."}
        return {"mensagem": "Contato adiado."}
    except Exception as erro:
        return {"erro": str(erro)}

@router.put("/clientes/{cliente_id}/nao-contatar")
def alternar_nao_contatar(cliente_id: int, dados: AlternarFlag):
    """
    Trava manual e permanente (até desmarcar) do motor de recomendação:
    cliente marcado como "não contatar" nunca aparece na fila, em nenhum
    serviço, até alguém desmarcar -- reversível de propósito.
    """
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()

        cursor.execute(
            "UPDATE clientes SET nao_contatar = %s WHERE id = %s;",
            (dados.valor, cliente_id)
        )
        linhas_afetadas = cursor.rowcount
        conexao.commit()
        cursor.close()
        conexao.close()

        if linhas_afetadas == 0: return {"erro": "Cliente não encontrado."}
        return {"mensagem": "Marcado como não contatar." if dados.valor else "Desmarcado."}
    except Exception as erro:
        return {"erro": str(erro)}

@router.put("/clientes/{cliente_id}/problema-aberto")
def alternar_problema_aberto(cliente_id: int, dados: AlternarFlag):
    """
    Trava manual do motor de recomendação: cliente com reclamação em aberto
    não aparece na fila até alguém marcar como resolvido. Diferente de
    "não contatar" (permanente), essa é pensada pra ser temporária -- o
    auto-expirar sozinho ainda não está implementado, só o marcar/desmarcar.
    """
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()

        cursor.execute(
            "UPDATE clientes SET problema_aberto = %s WHERE id = %s;",
            (dados.valor, cliente_id)
        )
        linhas_afetadas = cursor.rowcount
        conexao.commit()
        cursor.close()
        conexao.close()

        if linhas_afetadas == 0: return {"erro": "Cliente não encontrado."}
        return {"mensagem": "Marcado como problema aberto." if dados.valor else "Marcado como resolvido."}
    except Exception as erro:
        return {"erro": str(erro)}

@router.put("/clientes/{cliente_id}/reativar")
def reativar_cliente(cliente_id: int):
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()

        comando_sql = "UPDATE clientes SET ativo = TRUE WHERE id = %s AND ativo = FALSE;"
        cursor.execute(comando_sql, (cliente_id,))

        linhas_afetadas = cursor.rowcount
        conexao.commit()
        cursor.close()
        conexao.close()

        if linhas_afetadas == 0: return {"erro": "Cliente não encontrado ou já está ativo."}
        return {"mensagem": "Cliente reativado com sucesso!"}
    except Exception as erro:
        return {"erro": str(erro)}

@router.delete("/clientes/{cliente_id}/permanente")
def excluir_cliente_permanente(cliente_id: int):
    """
    Exclusão física e definitiva: apaga o cliente e todo o seu histórico de vendas.
    Só opera sobre clientes já arquivados (ativo = FALSE), como segunda trava de segurança
    além da confirmação no frontend.
    """
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()

        cursor.execute("SELECT ativo FROM clientes WHERE id = %s;", (cliente_id,))
        linha = cursor.fetchone()

        if not linha:
            cursor.close()
            conexao.close()
            return {"erro": "Cliente não encontrado."}

        if linha[0]:
            cursor.close()
            conexao.close()
            return {"erro": "Arquive o cliente antes de excluir permanentemente."}

        cursor.execute("DELETE FROM vendas WHERE cliente_id = %s;", (cliente_id,))
        cursor.execute("DELETE FROM clientes WHERE id = %s;", (cliente_id,))

        conexao.commit()
        cursor.close()
        conexao.close()
        return {"mensagem": "Cliente excluído permanentemente."}
    except Exception as erro:
        return {"erro": str(erro)}

from datetime import date

from fastapi import APIRouter, Depends

from auth import verificar_token
from database import conectar_banco
from models import NovoContato
from motor_classificacao import aplicar_travas, classificar_todos, montar_fila
from motor_reentrada import registrar_contato

router = APIRouter(dependencies=[Depends(verificar_token)])

# ==============================================================================
# MOTOR DE RECOMENDAÇÃO -- rotas de diagnóstico das Fases 1, 2 e 3
# ==============================================================================
@router.get("/motor/classificacao")
def obter_classificacao():
    """ Situação de cada cliente+serviço (ciclo esperado, razão, status)
    calculada SÓ pela última compra -- inclui os que estão "Ativo" (em dia).

    De propósito NÃO aplica as travas de contato (sem telefone, contatado há
    pouco, adiado, "não contatar"...): elas decidem quem entra na FILA de
    hoje (/motor/fila), não em que pé o cliente está. Aplicar aqui fazia
    todo mundo que uma trava barrava sumir daqui e aparecer como "Em dia" no
    Painel de Recuperação -- ex: uma planilha sem coluna de telefone deixava
    a base inteira "Em dia". Só cliente arquivado fica de fora. """
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()

        linhas = classificar_todos(cursor)
        cursor.execute("SELECT id FROM clientes WHERE ativo;")
        ids_ativos = {linha[0] for linha in cursor.fetchall()}
        linhas = [linha for linha in linhas if linha["cliente_id"] in ids_ativos]

        if linhas:
            ids_clientes = list({l["cliente_id"] for l in linhas})
            ids_servicos = list({l["servico_id"] for l in linhas})

            cursor.execute("SELECT id, nome FROM clientes WHERE id = ANY(%s);", (ids_clientes,))
            nomes_clientes = dict(cursor.fetchall())
            cursor.execute("SELECT id, nome FROM servicos WHERE id = ANY(%s);", (ids_servicos,))
            nomes_servicos = dict(cursor.fetchall())

            for linha in linhas:
                linha["cliente_nome"] = nomes_clientes.get(linha["cliente_id"], "Desconhecido")
                linha["servico_nome"] = nomes_servicos.get(linha["servico_id"], "Desconhecido")

        cursor.close()
        conexao.close()
        return {"linhas": linhas}
    except Exception as erro:
        return {"erro": f"Erro ao calcular classificação: {erro}"}

@router.get("/motor/fila")
def obter_fila(modo: str = "recuperacao", tamanho: int = 10, servico_id: int | None = None):
    """ Fila final do motor (Fases 1+2+3): já ordenada, colapsada pra 1 linha
    por pessoa e cortada no tamanho pedido -- é o que a aba "Hoje" consome
    (Fase 5). `modo` aceita "recuperacao" (padrão) ou "antecipacao".
    `servico_id`, se passado, filtra a fila pra mostrar só aquele serviço --
    o filtro é aplicado ANTES do corte de tamanho, pra sempre completar até
    `tamanho` itens daquele serviço (em vez de filtrar depois de já ter
    cortado uma mistura de serviços diferentes). """
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()

        linhas = classificar_todos(cursor)
        linhas = aplicar_travas(linhas, cursor)
        if servico_id is not None:
            linhas = [linha for linha in linhas if linha["servico_id"] == servico_id]
        linhas = montar_fila(linhas, cursor, modo=modo, tamanho_fila=tamanho)

        if linhas:
            ids_clientes = list({l["cliente_id"] for l in linhas})
            ids_servicos = list({l["servico_id"] for l in linhas})

            cursor.execute("SELECT id, nome FROM clientes WHERE id = ANY(%s);", (ids_clientes,))
            nomes_clientes = dict(cursor.fetchall())
            cursor.execute("SELECT id, nome FROM servicos WHERE id = ANY(%s);", (ids_servicos,))
            nomes_servicos = dict(cursor.fetchall())

            for linha in linhas:
                linha["cliente_nome"] = nomes_clientes.get(linha["cliente_id"], "Desconhecido")
                linha["servico_nome"] = nomes_servicos.get(linha["servico_id"], "Desconhecido")

        cursor.close()
        conexao.close()
        return {"fila": linhas}
    except Exception as erro:
        return {"erro": f"Erro ao montar fila: {erro}"}

@router.get("/motor/adiados")
def obter_adiados():
    """ Linhas (cliente+serviço) que a pessoa pediu pra adiar (ou recusou) e
    cuja data de reentrada mais recente ainda não chegou. Alimenta a seção
    "Adiados" da aba Hoje.

    Linha cujo último contato foi uma mensagem enviada ('silencio' -- o
    "Enviar" da fila e o "Contatar" dos próprios adiados) NÃO é adiada: ela já
    foi contatada e aparece em "Contatados". O prazo de reentrada de 1/4 do
    ciclo continua valendo pra fila (travas), mas listá-la aqui também fazia o
    mesmo cliente aparecer em Adiados e em Contatados ao mesmo tempo. """
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()
        hoje = date.today()

        cursor.execute("""
            SELECT DISTINCT ON (c.cliente_id, c.servico_id)
                c.id, c.cliente_id, c.servico_id, c.data_reentrada, cl.nome, s.nome, c.resultado
            FROM contatos c
            JOIN clientes cl ON cl.id = c.cliente_id
            JOIN servicos s ON s.id = c.servico_id
            WHERE cl.ativo = TRUE
            ORDER BY c.cliente_id, c.servico_id, c.data_contato DESC, c.id DESC;
        """)

        adiados = []
        for contato_id, cliente_id, servico_id, data_reentrada, cliente_nome, servico_nome, resultado in cursor.fetchall():
            if resultado == "silencio":
                continue  # já contatado: vive em "Contatados", não em "Adiados"
            if data_reentrada and data_reentrada > hoje:
                adiados.append({
                    "contato_id": contato_id,
                    "cliente_id": cliente_id,
                    "cliente_nome": cliente_nome,
                    "servico_id": servico_id,
                    "servico_nome": servico_nome,
                    "data_reentrada": data_reentrada.isoformat(),
                    "dias_restantes": (data_reentrada - hoje).days,
                })
        adiados.sort(key=lambda a: a["dias_restantes"])

        cursor.close()
        conexao.close()
        return {"adiados": adiados}
    except Exception as erro:
        return {"erro": f"Erro ao buscar adiados: {erro}"}

@router.get("/motor/contatados")
def obter_contatados():
    """ Registro de quem já recebeu um clique em "Enviar" (resultado=
    'silencio' na tabela de contatos) -- mais recente primeiro. Alimenta a
    sub-aba "Contatados" da página Hoje.

    `reativado` = o cliente comprou o MESMO serviço da mensagem em data
    estritamente posterior ao contato (a unidade do motor é cliente+serviço;
    estritamente depois pra não contar uma venda que já existia no mesmo dia
    do clique). `data_reativacao` é a primeira dessas compras. """
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()
        hoje = date.today()

        cursor.execute("""
            SELECT c.cliente_id, c.servico_id, c.data_contato, cl.nome, s.nome,
                   (SELECT MIN(v.data_da_venda) FROM vendas v
                     WHERE v.cliente_id = c.cliente_id
                       AND v.servico_id = c.servico_id
                       AND v.data_da_venda > c.data_contato) AS data_reativacao
            FROM contatos c
            JOIN clientes cl ON cl.id = c.cliente_id
            JOIN servicos s ON s.id = c.servico_id
            WHERE c.resultado = 'silencio'
            ORDER BY c.data_contato DESC, c.id DESC;
        """)

        contatados = [
            {
                "cliente_id": cliente_id,
                "cliente_nome": cliente_nome,
                "servico_id": servico_id,
                "servico_nome": servico_nome,
                "data_contato": data_contato.isoformat(),
                "dias_atras": (hoje - data_contato).days,
                "reativado": data_reativacao is not None,
                "data_reativacao": data_reativacao.isoformat() if data_reativacao else None,
            }
            for cliente_id, servico_id, data_contato, cliente_nome, servico_nome, data_reativacao in cursor.fetchall()
        ]

        cursor.close()
        conexao.close()
        return {"contatados": contatados}
    except Exception as erro:
        return {"erro": f"Erro ao buscar contatados: {erro}"}

@router.post("/motor/contatos")
def criar_contato(dados: NovoContato):
    """ Fase 4 / Etapa 5: registra o resultado de um contato (silêncio, pediu
    pra adiar, recusou) e calcula a data de reentrada -- sem alterar o status
    de ninguém, conforme o documento. """
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()

        data_manual = date.fromisoformat(dados.data_reentrada_manual) if dados.data_reentrada_manual else None
        resultado = registrar_contato(
            dados.cliente_id, dados.servico_id, dados.resultado, cursor,
            data_reentrada_manual=data_manual
        )

        conexao.commit()
        cursor.close()
        conexao.close()
        return resultado
    except ValueError as erro:
        return {"erro": str(erro)}
    except Exception as erro:
        return {"erro": f"Erro ao registrar contato: {erro}"}

@router.delete("/motor/contatos/{contato_id}")
def desfazer_contato(contato_id: int):
    """ "Desfazer é obrigatório" (documento): reverte um registro de contato
    -- útil quando alguém clica no botão errado. Não desfaz sozinho um
    "vira não contatar" que esse contato tenha causado; isso já tem seu
    próprio botão reversível (PUT /clientes/{id}/nao-contatar). """
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()

        cursor.execute("DELETE FROM contatos WHERE id = %s;", (contato_id,))
        linhas_afetadas = cursor.rowcount
        conexao.commit()
        cursor.close()
        conexao.close()

        if linhas_afetadas == 0: return {"erro": "Contato não encontrado."}
        return {"mensagem": "Contato desfeito."}
    except Exception as erro:
        return {"erro": str(erro)}

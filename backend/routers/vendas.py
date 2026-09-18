from datetime import datetime, timedelta

from fastapi import APIRouter, Depends

from auth import verificar_token
from database import conectar_banco
from models import NovaVenda

router = APIRouter(dependencies=[Depends(verificar_token)])

# ==============================================================================
# ROTAS FINANCEIRAS
# ==============================================================================
@router.post("/vendas")
def registrar_venda(venda: NovaVenda):
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()

        comando_sql = "INSERT INTO vendas (cliente_id, valor, servico_id, data_da_venda) VALUES (%s, %s, %s, CURRENT_DATE);"
        cursor.execute(comando_sql, (venda.cliente_id, venda.valor, venda.servico_id))

        conexao.commit()
        cursor.close()
        conexao.close()
        return {"mensagem": "Venda registrada com sucesso!"}
    except Exception as erro:
        return {"erro": f"Erro interno ao registrar venda: {erro}"}

@router.get("/estatisticas")
def obter_estatisticas():
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()

        cursor.execute("SELECT COALESCE(SUM(valor), 0) FROM vendas;")
        total_recuperado = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(DISTINCT cliente_id) FROM vendas;")
        clientes_reativados = cursor.fetchone()[0]

        cursor.close()
        conexao.close()
        return {
            "total_recuperado": float(total_recuperado),
            "clientes_reativados": int(clientes_reativados)
        }
    except Exception as erro:
        return {"erro": f"Erro ao calcular estatísticas financeiras: {erro}"}

NOMES_MESES_ABREV = {
    1: "Jan", 2: "Fev", 3: "Mar", 4: "Abr", 5: "Mai", 6: "Jun",
    7: "Jul", 8: "Ago", 9: "Set", 10: "Out", 11: "Nov", 12: "Dez"
}

def _receita_por_mes(meses: int):
    meses = max(1, min(meses, 24))
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()

        cursor.execute("""
            SELECT TO_CHAR(DATE_TRUNC('month', data_da_venda), 'YYYY-MM') AS mes,
                   SUM(valor) AS total,
                   COUNT(*) AS quantidade
            FROM vendas
            WHERE data_da_venda >= (CURRENT_DATE - make_interval(months => %s))
            GROUP BY mes;
        """, (meses - 1,))
        dados_por_mes = {
            mes_chave: (float(total), int(quantidade))
            for mes_chave, total, quantidade in cursor.fetchall()
        }

        cursor.close()
        conexao.close()

        hoje = datetime.now().date()
        ano, mes = hoje.year, hoje.month

        serie = []
        for _ in range(meses):
            chave = f"{ano:04d}-{mes:02d}"
            valor, quantidade = dados_por_mes.get(chave, (0.0, 0))
            serie.append({
                "mes": chave,
                "mes_label": f"{NOMES_MESES_ABREV[mes]}/{str(ano)[2:]}",
                "valor": valor,
                "quantidade": quantidade
            })
            mes -= 1
            if mes == 0:
                mes = 12
                ano -= 1

        serie.reverse()
        return {"meses": serie}
    except Exception as erro:
        return {"erro": f"Erro ao calcular receita mensal: {erro}"}

def _receita_por_ano(anos: int):
    """ Mesma ideia de _receita_por_mes, mas agrupando por ano -- pra "últimos 5 anos"
    não virar 60 pontos ilegíveis no gráfico, vira 5. """
    anos = max(1, min(anos, 10))
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()

        cursor.execute("""
            SELECT TO_CHAR(DATE_TRUNC('year', data_da_venda), 'YYYY') AS ano,
                   SUM(valor) AS total,
                   COUNT(*) AS quantidade
            FROM vendas
            WHERE data_da_venda >= (CURRENT_DATE - make_interval(years => %s))
            GROUP BY ano;
        """, (anos - 1,))
        dados_por_ano = {
            ano_chave: (float(total), int(quantidade))
            for ano_chave, total, quantidade in cursor.fetchall()
        }

        cursor.close()
        conexao.close()

        ano_atual = datetime.now().date().year

        serie = []
        for i in range(anos - 1, -1, -1):
            ano = ano_atual - i
            chave = f"{ano:04d}"
            valor, quantidade = dados_por_ano.get(chave, (0.0, 0))
            serie.append({
                "mes": chave,
                "mes_label": chave,
                "valor": valor,
                "quantidade": quantidade
            })

        return {"meses": serie}
    except Exception as erro:
        return {"erro": f"Erro ao calcular receita anual: {erro}"}

def _receita_por_semana(quantidade: int, passo_semanas: int):
    """ Agrupa vendas em blocos de `passo_semanas` semanas cada, terminando hoje.
    "3 meses" usa 12 blocos de 1 semana; "6 meses" usa 13 blocos de 2 semanas --
    mais detalhe do que um ponto por mês, sem virar uma poeira de pontos diários. """
    quantidade = max(1, min(quantidade, 26))
    passo_semanas = max(1, min(passo_semanas, 8))
    try:
        hoje = datetime.now().date()
        dias_totais = quantidade * passo_semanas * 7
        data_inicio = hoje - timedelta(days=dias_totais - 1)

        conexao = conectar_banco()
        cursor = conexao.cursor()
        cursor.execute("""
            SELECT data_da_venda, valor
            FROM vendas
            WHERE data_da_venda >= %s;
        """, (data_inicio,))
        linhas = cursor.fetchall()
        cursor.close()
        conexao.close()

        blocos = [{"valor": 0.0, "quantidade": 0} for _ in range(quantidade)]
        for data_venda, valor in linhas:
            indice = (data_venda - data_inicio).days // (passo_semanas * 7)
            if 0 <= indice < quantidade:
                blocos[indice]["valor"] += float(valor)
                blocos[indice]["quantidade"] += 1

        serie = []
        for i, bloco in enumerate(blocos):
            inicio_bloco = data_inicio + timedelta(days=i * passo_semanas * 7)
            serie.append({
                "mes": inicio_bloco.isoformat(),
                "mes_label": f"{inicio_bloco.day:02d}/{inicio_bloco.month:02d}",
                "valor": bloco["valor"],
                "quantidade": bloco["quantidade"]
            })

        return {"meses": serie}
    except Exception as erro:
        return {"erro": f"Erro ao calcular receita semanal: {erro}"}

@router.get("/estatisticas/receita-mensal")
def obter_receita_mensal(unidade: str = "mes", quantidade: int = 12, passo: int = 1):
    """ Receita e quantidade de vendas agrupadas por semana (unidade=semana, com
    `passo` semanas por bloco), mês (padrão) ou ano (unidade=ano), incluindo
    períodos sem nenhuma venda com valor 0. """
    if unidade == "ano":
        return _receita_por_ano(quantidade)
    if unidade == "semana":
        return _receita_por_semana(quantidade, passo)
    return _receita_por_mes(quantidade)

@router.get("/estatisticas/clientes-periodo")
def obter_clientes_periodo(unidade: str = "mes", quantidade: int = 12, passo: int = 1):
    """ Quantos clientes distintos compraram no período, e os 5 que mais
    compraram (em valor), pro mesmo período selecionado no Painel da Receita. """
    if unidade == "ano":
        intervalo_sql = "make_interval(years => %s)"
        parametro = max(1, min(quantidade, 10))
    elif unidade == "semana":
        intervalo_sql = "make_interval(weeks => %s)"
        parametro = max(1, min(quantidade, 26)) * max(1, min(passo, 8))
    else:
        intervalo_sql = "make_interval(months => %s)"
        parametro = max(1, min(quantidade, 24))

    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()

        cursor.execute(f"""
            SELECT c.id, c.nome, COUNT(v.id) AS total_compras, COALESCE(SUM(v.valor), 0) AS total_valor
            FROM vendas v
            JOIN clientes c ON c.id = v.cliente_id
            WHERE v.data_da_venda >= (CURRENT_DATE - {intervalo_sql})
            GROUP BY c.id, c.nome
            ORDER BY total_valor DESC
            LIMIT 5;
        """, (parametro,))
        top_clientes = [
            {"id": linha[0], "nome": linha[1], "total_compras": linha[2], "total_valor": float(linha[3])}
            for linha in cursor.fetchall()
        ]

        cursor.execute(f"""
            SELECT COUNT(DISTINCT cliente_id)
            FROM vendas
            WHERE data_da_venda >= (CURRENT_DATE - {intervalo_sql});
        """, (parametro,))
        total_clientes_periodo = cursor.fetchone()[0]

        cursor.close()
        conexao.close()

        return {
            "total_clientes_periodo": int(total_clientes_periodo),
            "top_clientes": top_clientes
        }
    except Exception as erro:
        return {"erro": f"Erro ao calcular clientes do período: {erro}"}

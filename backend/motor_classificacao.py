import re
import statistics
from datetime import date

# Cortes de razão do ciclo (dias sem comprar / ciclo esperado) que definem os
# 5 status. RAZAO_ATIVO = 0.8 é o único corte confirmado no documento
# "motor-de-recomendacao.pdf" ("Status ativo (razão ≤ 0,8)"); os outros três
# ainda não foram calibrados com o sócio ADM -- propositalmente isolados
# aqui em cima, fáceis de achar e ajustar sem tocar na lógica de cálculo.
RAZAO_ATIVO = 0.8
RAZAO_RECOMPRA_PROXIMA = 1.0
RAZAO_ATRASADO = 1.5
RAZAO_ADORMECIDO = 3.0

# "Prestes a virar frio" (documento, Etapa 4): fração do corte de Frio a
# partir da qual um Adormecido conta como "quase lá". O documento cita a
# regra mas não dá o número exato -- 90% é um ponto de partida, ajustável.
FRACAO_PRESTES_A_VIRAR_FRIO = 0.9

# Ordem dos status na fila -- é PARÂMETRO (lista), não if no código, porque o
# documento define "modo antecipação" como a mesma regra com outra ordem.
# Ativo nunca aparece aqui: já foi eliminado na Fase 2 (é trava).
ORDEM_STATUS_RECUPERACAO = ["Atrasado", "Adormecido", "Recompra próxima", "Frio"]
ORDEM_STATUS_ANTECIPACAO = ["Recompra próxima", "Atrasado", "Adormecido", "Frio"]

ORDEM_VALOR = ["Alto", "Médio", "Baixo"]

# Confiança do nível usado pro ciclo esperado -- "ciclo próprio antes de
# ciclo herdado da base" (documento, desempate #7). Menor índice = mais
# confiável.
ORDEM_CONFIANCA_NIVEL = ["empresa", "cliente", "peers", "base"]

# Trava "pessoa contatada nos últimos X dias" (documento, 5ª trava): o
# documento não dá o valor de X -- 3 dias é um ponto de partida, ajustável.
DIAS_MINIMOS_ENTRE_CONTATOS = 3


def classificar_status(razao: float) -> str:
    """ Status por linha (cliente+serviço) -- função só da razão do ciclo,
    nunca do valor gasto (isso é regra do negócio: dinheiro só desempata
    depois, dentro do mesmo status). """
    if razao <= RAZAO_ATIVO:
        return "Ativo"
    if razao < RAZAO_RECOMPRA_PROXIMA:
        return "Recompra próxima"
    if razao < RAZAO_ATRASADO:
        return "Atrasado"
    if razao < RAZAO_ADORMECIDO:
        return "Adormecido"
    return "Frio"


def _intervalos(datas_ordenadas):
    """ Diferença em dias entre compras consecutivas de uma mesma lista de
    datas (já ordenada). Descarta intervalos de 0 dias -- duas compras no
    mesmo dia não representam um ciclo de recompra de verdade, e um ciclo de
    0 dias quebraria a divisão da razão mais adiante. """
    return [
        dias for i in range(1, len(datas_ordenadas))
        if (dias := (datas_ordenadas[i] - datas_ordenadas[i - 1]).days) > 0
    ]


def classificar_todos(cursor, hoje: date | None = None) -> list[dict]:
    """
    Motor de classificação (Fase 1). Para cada par cliente+serviço com pelo
    menos uma compra, calcula o ciclo esperado (fallback de 4 níveis: regra da
    empresa > histórico do próprio cliente > pares do mesmo serviço > mediana
    da base), a razão do ciclo e o status.

    Não aplica travas nem monta fila -- isso é Fase 2/3. É uma função pura
    (só lê do banco via o cursor recebido, não decide nada sozinha sobre
    contato) pra poder ser testada isolada.
    """
    hoje = hoje or date.today()

    cursor.execute("""
        SELECT cliente_id, servico_id, data_da_venda FROM vendas
        WHERE cliente_id IS NOT NULL AND servico_id IS NOT NULL
        ORDER BY data_da_venda;
    """)

    datas_por_par: dict[tuple[int, int], list[date]] = {}
    for cliente_id, servico_id, data_venda in cursor.fetchall():
        datas_por_par.setdefault((cliente_id, servico_id), []).append(data_venda)
    for datas in datas_por_par.values():
        datas.sort()

    # Nível 2 (histórico do próprio cliente) já sai pronto daqui: um intervalo
    # por par cliente+serviço.
    intervalos_por_par = {par: _intervalos(datas) for par, datas in datas_por_par.items()}

    # Nível 3 (pares do mesmo serviço): agrupa os intervalos de TODOS os
    # clientes que compraram aquele serviço -- nunca as datas cruas entre
    # clientes diferentes, senão o "intervalo" vira lixo sem sentido.
    intervalos_por_servico: dict[int, list[int]] = {}
    for (cliente_id, servico_id), intervalos in intervalos_por_par.items():
        intervalos_por_servico.setdefault(servico_id, []).extend(intervalos)
    ciclo_por_servico = {
        servico_id: round(statistics.median(intervalos))
        for servico_id, intervalos in intervalos_por_servico.items()
        if intervalos
    }

    # Nível 4 (mediana da base): todos os intervalos, de todos os serviços,
    # jogados juntos -- último recurso quando nem o serviço tem histórico.
    intervalos_base = [i for intervalos in intervalos_por_par.values() for i in intervalos]
    ciclo_base = round(statistics.median(intervalos_base)) if intervalos_base else None

    # Nível 1 (regra da empresa): configurado direto na tabela de serviços.
    cursor.execute("SELECT id, dias_ciclo FROM servicos WHERE dias_ciclo IS NOT NULL;")
    ciclo_configurado = dict(cursor.fetchall())

    resultado = []
    for (cliente_id, servico_id), datas in datas_por_par.items():
        if servico_id in ciclo_configurado:
            ciclo_esperado, nivel = ciclo_configurado[servico_id], "empresa"
        elif intervalos_por_par[(cliente_id, servico_id)]:
            ciclo_esperado = round(statistics.median(intervalos_por_par[(cliente_id, servico_id)]))
            nivel = "cliente"
        elif servico_id in ciclo_por_servico:
            ciclo_esperado, nivel = ciclo_por_servico[servico_id], "peers"
        elif ciclo_base:
            ciclo_esperado, nivel = ciclo_base, "base"
        else:
            continue  # base nova demais -- nenhum nível tem dado pra estimar

        dias_sem_comprar = (hoje - datas[-1]).days
        razao = round(dias_sem_comprar / ciclo_esperado, 2)

        resultado.append({
            "cliente_id": cliente_id,
            "servico_id": servico_id,
            "dias_sem_comprar": dias_sem_comprar,
            "ciclo_esperado": ciclo_esperado,
            "nivel_ciclo": nivel,
            "razao": razao,
            "status": classificar_status(razao),
        })

    return resultado


def contar_silencios_consecutivos(cliente_id: int, cursor) -> int:
    """ Quantos silêncios seguidos essa PESSOA acumulou, olhando todo o
    histórico de contatos dela (todos os serviços juntos -- diferente da
    recusa, que é por linha) do mais recente pro mais antigo, parando no
    primeiro resultado que não for 'silencio'. Usado pra suspeitar de
    telefone errado (documento: "sem resposta 3x -> telefone suspeito"). """
    cursor.execute("""
        SELECT resultado FROM contatos
        WHERE cliente_id = %s
        ORDER BY data_contato DESC, id DESC;
    """, (cliente_id,))
    contador = 0
    for (resultado,) in cursor.fetchall():
        if resultado != "silencio":
            break
        contador += 1
    return contador


def _buscar_dados_contato(ids_clientes: list[int], cursor):
    """ Busca de uma vez só tudo que a Etapa 3 precisa da tabela de contatos:
    a data de reentrada mais recente de cada LINHA (cliente+serviço), quantos
    silêncios seguidos cada PESSOA acumulou, e a data do último contato com
    cada pessoa (qualquer serviço) -- pra não mandar 2 mensagens muito perto
    uma da outra. """
    reentrada_por_linha: dict[tuple[int, int], date | None] = {}
    silencios_por_cliente: dict[int, int] = {}
    ultimo_contato_por_cliente: dict[int, date] = {}

    if not ids_clientes:
        return reentrada_por_linha, silencios_por_cliente, ultimo_contato_por_cliente

    cursor.execute("""
        SELECT cliente_id, servico_id, resultado, data_contato, data_reentrada
        FROM contatos
        WHERE cliente_id = ANY(%s)
        ORDER BY cliente_id, data_contato DESC, id DESC;
    """, (ids_clientes,))

    ainda_contando_silencio: dict[int, bool] = {}
    for cliente_id, servico_id, resultado, data_contato, data_reentrada in cursor.fetchall():
        par = (cliente_id, servico_id)
        if par not in reentrada_por_linha:
            reentrada_por_linha[par] = data_reentrada  # 1ª vez que aparece = a mais recente

        if cliente_id not in ultimo_contato_por_cliente:
            ultimo_contato_por_cliente[cliente_id] = data_contato

        if ainda_contando_silencio.get(cliente_id, True):
            if resultado == "silencio":
                silencios_por_cliente[cliente_id] = silencios_por_cliente.get(cliente_id, 0) + 1
            else:
                ainda_contando_silencio[cliente_id] = False

    return reentrada_por_linha, silencios_por_cliente, ultimo_contato_por_cliente


def aplicar_travas(linhas: list[dict], cursor, hoje: date | None = None) -> list[dict]:
    """
    Fase 2 / Etapa 3 do documento "motor-de-recomendacao.pdf": as travas são
    filtros binários -- nunca pesos -- que barram contato, aplicadas ANTES de
    qualquer ordenação (Fase 3). "Se as travas fossem pesos, um cliente de
    altíssimo valor poderia subir o suficiente pra aparecer mesmo estando
    marcado como não contatar. Trava tem que ser trava."

    As 6 travas do documento, todas implementadas:
    - Status ativo (razão ≤ 0,8) -- a própria classificação já calcula isso;
      aqui só eliminamos, porque "Ativo não entra" é regra explícita da
      etapa de filtro, não só uma questão de ordenação.
    - Não contatar -- flag manual permanente (clientes.nao_contatar).
    - Problema aberto -- flag manual (clientes.problema_aberto). O documento
      diz que esse "deve expirar sozinho" (diferente de não_contatar, que é
      permanente até desmarcar) -- ainda não implementamos esse auto-expirar,
      só o marcar/desmarcar manual.
    - Data de reentrada no futuro -- agora por LINHA de verdade, lida da
      tabela de contatos (Fase 4), não mais aproximada por cliente inteiro.
    - Pessoa contatada nos últimos X dias -- X ainda não veio do documento
      (ver DIAS_MINIMOS_ENTRE_CONTATOS).
    - Telefone suspeito após 3 silêncios seguidos.

    "Baixa confiança" NÃO é trava -- só avisa no card. O documento é
    específico: só quando o ciclo vem do nível 4 (mediana da base).
    """
    hoje = hoje or date.today()
    if not linhas:
        return []

    ids_clientes = list({linha["cliente_id"] for linha in linhas})
    cursor.execute("""
        SELECT id, ativo, telefone, nao_contatar, problema_aberto
        FROM clientes WHERE id = ANY(%s);
    """, (ids_clientes,))
    dados_cliente = {
        id_: {"ativo": ativo, "telefone": telefone, "nao_contatar": nao_contatar, "problema_aberto": problema_aberto}
        for id_, ativo, telefone, nao_contatar, problema_aberto in cursor.fetchall()
    }

    reentrada_por_linha, silencios_por_cliente, ultimo_contato_por_cliente = _buscar_dados_contato(ids_clientes, cursor)

    resultado = []
    for linha in linhas:
        if linha["status"] == "Ativo":
            continue  # trava: status ativo (razão <= 0,8)

        cliente = dados_cliente.get(linha["cliente_id"])
        if not cliente or not cliente["ativo"]:
            continue  # cliente arquivado -- nem chega a ser uma das 6 travas, é pré-requisito básico

        if cliente["nao_contatar"]:
            continue  # trava: não contatar
        if cliente["problema_aberto"]:
            continue  # trava: problema aberto

        data_reentrada = reentrada_por_linha.get((linha["cliente_id"], linha["servico_id"]))
        if data_reentrada and data_reentrada > hoje:
            continue  # trava: data de reentrada no futuro (por linha)

        if silencios_por_cliente.get(linha["cliente_id"], 0) >= 3:
            continue  # trava: telefone suspeito (3 silêncios seguidos)

        ultimo_contato = ultimo_contato_por_cliente.get(linha["cliente_id"])
        if ultimo_contato and (hoje - ultimo_contato).days < DIAS_MINIMOS_ENTRE_CONTATOS:
            continue  # trava: pessoa contatada recentemente

        digitos_telefone = re.sub(r"\D", "", cliente["telefone"] or "")
        if len(digitos_telefone) < 10:
            continue  # checagem extra (não é uma das 6): sem telefone não dá nem pra tentar

        linha["baixa_confianca"] = linha["nivel_ciclo"] == "base"
        resultado.append(linha)

    return resultado


def _calcular_faixas_valor(cursor) -> dict[int, str]:
    """ Faixa de valor (Alto/Médio/Baixo, 20/60/20%) é do CLIENTE, não da
    linha -- um cliente de alto valor é alto valor em qualquer serviço dele.
    Usada só pra desempate dentro do mesmo status, nunca pra decidir status. """
    cursor.execute("""
        SELECT cliente_id, SUM(valor) FROM vendas
        WHERE cliente_id IS NOT NULL
        GROUP BY cliente_id;
    """)
    totais = cursor.fetchall()
    if not totais:
        return {}

    ordenado = sorted(totais, key=lambda t: t[1], reverse=True)
    total = len(ordenado)
    corte_alto = max(1, round(total * 0.2))
    corte_baixo = max(1, round(total * 0.2))

    faixas = {}
    for i, (cliente_id, _) in enumerate(ordenado):
        if i < corte_alto:
            faixas[cliente_id] = "Alto"
        elif i >= total - corte_baixo:
            faixas[cliente_id] = "Baixo"
        else:
            faixas[cliente_id] = "Médio"
    return faixas


def montar_fila(linhas: list[dict], cursor, modo: str = "recuperacao", tamanho_fila: int = 10) -> list[dict]:
    """
    Fase 3 / Etapa 4 do documento: ordena quem sobreviveu às travas.
    "Regra em uma frase: o status manda, o valor desempata."

    1. Exceção única: quem está "prestes a virar frio" (Adormecido, perto do
       corte) e nunca foi contatado sobe pro topo, valor não importa -- é a
       regra que garante que ninguém fica esquecido até ser tarde demais.
    2. Ordena por status (conforme o modo), depois faixa de valor, depois os
       desempates do documento: maior razão > nunca contatado > maior
       confiança no nível do ciclo.
    3. Colapsa pra 1 linha por PESSOA (Casos de Borda do documento: "mesma
       pessoa com 2+ serviços atrasados mantém só a linha de maior
       prioridade; as outras voltam em outro dia") -- mantém a de maior
       prioridade, já que a lista está ordenada nesse ponto.
    4. Corta no tamanho da fila.

    "Nunca contatado" hoje é aproximado por `proximo_contato_em IS NULL`
    (nunca passou pelo mecanismo de adiar/recusar) -- o documento pede isso
    a partir do histórico de contatos por linha, que é Fase 4.
    """
    if not linhas:
        return []

    ordem_status = ORDEM_STATUS_ANTECIPACAO if modo == "antecipacao" else ORDEM_STATUS_RECUPERACAO
    faixas_valor = _calcular_faixas_valor(cursor)

    ids_clientes = list({linha["cliente_id"] for linha in linhas})
    cursor.execute("SELECT id, proximo_contato_em FROM clientes WHERE id = ANY(%s);", (ids_clientes,))
    nunca_contatado = {id_: proximo_contato_em is None for id_, proximo_contato_em in cursor.fetchall()}

    limite_prestes_a_frio = RAZAO_ADORMECIDO * FRACAO_PRESTES_A_VIRAR_FRIO
    for linha in linhas:
        linha["faixa_valor"] = faixas_valor.get(linha["cliente_id"], "Médio")
        linha["nunca_contatado"] = nunca_contatado.get(linha["cliente_id"], True)
        linha["prestes_a_virar_frio"] = (
            linha["status"] == "Adormecido"
            and linha["razao"] >= limite_prestes_a_frio
            and linha["nunca_contatado"]
        )

    def chave_ordenacao(linha):
        return (
            0 if linha["prestes_a_virar_frio"] else 1,
            ordem_status.index(linha["status"]),
            ORDEM_VALOR.index(linha["faixa_valor"]),
            -linha["razao"],
            0 if linha["nunca_contatado"] else 1,
            ORDEM_CONFIANCA_NIVEL.index(linha["nivel_ciclo"]),
        )

    ordenadas = sorted(linhas, key=chave_ordenacao)

    vistos = set()
    colapsadas = []
    for linha in ordenadas:
        if linha["cliente_id"] in vistos:
            continue
        vistos.add(linha["cliente_id"])
        colapsadas.append(linha)

    return colapsadas[:tamanho_fila]

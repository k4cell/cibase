import statistics
from datetime import date

# Cortes de razão do ciclo (dias sem comprar / ciclo esperado) que definem os
# 5 status. São um ponto de partida -- ainda não calibrados com o sócio ADM --
# e propositalmente isolados aqui em cima, fáceis de achar e ajustar sem tocar
# na lógica de cálculo abaixo.
RAZAO_ATIVO = 0.75
RAZAO_RECOMPRA_PROXIMA = 1.0
RAZAO_ATRASADO = 1.5
RAZAO_ADORMECIDO = 3.0


def classificar_status(razao: float) -> str:
    """ Status por linha (cliente+serviço) -- função só da razão do ciclo,
    nunca do valor gasto (isso é regra do negócio: dinheiro só desempata
    depois, dentro do mesmo status). """
    if razao < RAZAO_ATIVO:
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

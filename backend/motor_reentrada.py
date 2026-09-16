from datetime import date, timedelta

from motor_classificacao import classificar_todos

# Aproximação de "meses" em dias pros tetos de recusa (o documento dá os
# valores em meses -- 12 e 18 -- e também exemplos aproximados em dias pra um
# ciclo de 365d, "~365" e "~548"; 30 dias/mês bate perto o suficiente).
DIAS_POR_MES = 30

RESULTADOS_VALIDOS = ("silencio", "adiar_com_data", "adiar_sem_data", "recusou")


def _ciclo_esperado_da_linha(cliente_id: int, servico_id: int, cursor) -> int | None:
    """ Reaproveita o motor de classificação (Fase 1) só pra pegar o ciclo
    esperado de UMA linha -- é o número usado nas contas de reentrada abaixo
    (1/4 do ciclo pro silêncio, 1 ou 2 ciclos pra recusa). """
    for linha in classificar_todos(cursor):
        if linha["cliente_id"] == cliente_id and linha["servico_id"] == servico_id:
            return linha["ciclo_esperado"]
    return None


def _contar_recusas_consecutivas(cliente_id: int, servico_id: int, cursor) -> int:
    """ Quantas recusas seguidas essa LINHA (cliente+serviço) já tem antes
    deste novo registro -- decide se a recusa que está sendo gravada agora é
    a 1ª, a 2ª ou a 3ª (que vira "não contatar"). """
    cursor.execute("""
        SELECT resultado FROM contatos
        WHERE cliente_id = %s AND servico_id = %s
        ORDER BY data_contato DESC, id DESC;
    """, (cliente_id, servico_id))
    contador = 0
    for (resultado,) in cursor.fetchall():
        if resultado != "recusou":
            break
        contador += 1
    return contador


def registrar_contato(
    cliente_id: int,
    servico_id: int,
    resultado: str,
    cursor,
    data_reentrada_manual: date | None = None,
    hoje: date | None = None,
) -> dict:
    """
    Fase 4 / Etapa 5 do documento: grava o resultado de um contato e calcula
    a data de reentrada. Princípio central do documento: "o resultado do
    contato NÃO altera o status -- ele grava uma data de reentrada". Quando
    essa data chegar, a linha é recalculada do zero pela Fase 1, em pé de
    igualdade com todas as outras -- não existe fila separada pra quem já
    foi contatado.

    Tabela de prazos (documento, seção 5):
    - silencio / adiar_sem_data -> 1/4 do ciclo esperado
    - adiar_com_data -> a data que a pessoa pediu, direto
    - recusou (1ª vez) -> 1 ciclo, com teto de 12 meses
    - recusou (2ª vez seguida) -> 2 ciclos, com teto de 18 meses
    - recusou (3ª vez seguida) -> vira "não contatar" (permanente, reversível
      pelo endpoint de sempre) -- não grava data de reentrada, não faz mais
      sentido
    """
    hoje = hoje or date.today()
    if resultado not in RESULTADOS_VALIDOS:
        raise ValueError(f"resultado inválido: {resultado}. Use um de {RESULTADOS_VALIDOS}.")
    if resultado == "adiar_com_data" and not data_reentrada_manual:
        raise ValueError("resultado 'adiar_com_data' exige data_reentrada_manual.")

    ciclo = _ciclo_esperado_da_linha(cliente_id, servico_id, cursor)
    data_reentrada = None
    vira_nao_contatar = False

    if resultado in ("silencio", "adiar_sem_data"):
        if ciclo:
            data_reentrada = hoje + timedelta(days=round(ciclo / 4))

    elif resultado == "adiar_com_data":
        data_reentrada = data_reentrada_manual

    elif resultado == "recusou":
        recusas_anteriores = _contar_recusas_consecutivas(cliente_id, servico_id, cursor)
        if recusas_anteriores >= 2:
            vira_nao_contatar = True
        elif ciclo:
            multiplicador = recusas_anteriores + 1  # 1ª recusa=1 ciclo, 2ª=2 ciclos
            teto_dias = (12 if multiplicador == 1 else 18) * DIAS_POR_MES
            data_reentrada = hoje + timedelta(days=min(ciclo * multiplicador, teto_dias))

    cursor.execute("""
        INSERT INTO contatos (cliente_id, servico_id, data_contato, resultado, data_reentrada)
        VALUES (%s, %s, %s, %s, %s) RETURNING id;
    """, (cliente_id, servico_id, hoje, resultado, data_reentrada))
    contato_id = cursor.fetchone()[0]

    if vira_nao_contatar:
        cursor.execute("UPDATE clientes SET nao_contatar = TRUE WHERE id = %s;", (cliente_id,))

    return {
        "contato_id": contato_id,
        "data_reentrada": data_reentrada.isoformat() if data_reentrada else None,
        "vira_nao_contatar": vira_nao_contatar,
    }

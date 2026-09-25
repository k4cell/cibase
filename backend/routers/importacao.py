import csv
import io
import re
import unicodedata

import openpyxl
from fastapi import APIRouter, Depends, UploadFile, File

from auth import verificar_token
from database import conectar_banco

router = APIRouter(dependencies=[Depends(verificar_token)])

# Cada campo é reconhecido por QUALQUER cabeçalho que CONTENHA uma das palavras-chave
# (não precisa bater a frase inteira) -- assim "Nome do Cliente", "Nome Completo" e "nome"
# caem todos em "nome" sem precisar cadastrar cada variação manualmente.
#
# A ordem importa MUITO: campos de negócio específicos (serviço, valor, data)
# vêm antes de "nome"/"cliente" de propósito -- "nome" é a palavra mais
# genérica de todas e apareceria dentro de cabeçalhos de outros campos
# também (ex: "Nome do Produto", "Nome do Serviço"). Se "nome" fosse checado
# primeiro, essas colunas cairiam erradas em vez de caírem em "servico".
#
# Dentro de cada tupla, a ORDEM das palavras-chave também importa: quanto
# mais à esquerda, mais forte -- é o desempate quando DUAS colunas da mesma
# planilha caem no mesmo campo (ex: "Item" [1, 2, 3...] e "Serviço /
# Manutenção" -- as duas viram "servico", vence a de palavra mais forte).
REGRAS_CABECALHO = [
    (("data da venda", "dia da venda", "data venda", "dia venda", "data_da_venda",
      "data da compra", "dia da compra", "data compra", "dia compra"), "data_da_venda"),
    (("nascimento", "aniversario"), "data_nascimento"),
    # Planilha de CATÁLOGO de serviços (nome do serviço + ciclo de recompra).
    # Vêm antes de "servico"/"valor" porque o cabeçalho costuma misturar as
    # palavras ("Ciclo por Tempo (Meses)", "Ciclo do Serviço"). Quilometragem
    # é reconhecida só pra ser IGNORADA -- o sistema mede ciclo em tempo.
    (("quilometragem", "(km)", " km"), "ciclo_km"),
    (("meses",), "ciclo_meses"),
    (("dias",), "ciclo_dias"),
    (("ciclo", "intervalo", "periodicidade"), "ciclo"),
    (("servico", "produto", "manutencao", "procedimento", "item"), "servico"),
    (("valor", "receita", "preco"), "valor"),
    # Fallback pra planilha que só chama a coluna de "Data" (sem "da venda"/"da
    # compra") -- vem DEPOIS de "nascimento" de propósito, senão "Data de
    # Nascimento" cairia aqui em vez de virar data_nascimento.
    (("data",), "data_da_venda"),
    (("e-mail", "e mail", "email"), "email"),
    (("cpf", "documento"), "cpf"),
    (("telefone", "celular", "whatsapp", "fone", "tel", "contato"), "telefone"),
    # "nome"/"cliente" por ÚLTIMO -- ver nota acima.
    (("nome", "cliente"), "nome"),
]

CAMPOS_CONHECIDOS = {campo for _, campo in REGRAS_CABECALHO}

# Mesma aproximação do motor (backend/motor_reentrada.py) e do frontend
# (utils/formatacao.ts): 1 mês = 30 dias. dias_ciclo no banco é SEMPRE em
# dias; unidade_ciclo só guarda como reexibir.
DIAS_POR_MES = 30

# Quantas linhas do topo procurar o cabeçalho -- planilha "bonita" costuma ter
# título, subtítulo e linha em branco antes da tabela de verdade.
LINHAS_PROCURA_CABECALHO = 15

def _normalizar_texto(texto: str) -> str:
    return unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode("ascii").strip().lower()

def _classificar_cabecalho(texto: str):
    """ Devolve (campo, força). Força = posição da palavra-chave que casou
    dentro da regra (menor = mais forte) -- usada só pra desempatar colunas
    que caem no mesmo campo. Sem regra que case, devolve o próprio texto
    normalizado com força alta (não é um campo conhecido). """
    normalizado = _normalizar_texto(texto)
    for palavras_chave, campo in REGRAS_CABECALHO:
        forcas = [i for i, chave in enumerate(palavras_chave) if chave in normalizado]
        if forcas:
            return campo, min(forcas)
    return normalizado, 99

def _mapear_cabecalho(texto: str) -> str:
    """ Reconhece cabeçalhos em português com acento/espaço e variações de redação
    (ex: "Nome do Cliente", "Data de Nascimento", "Dia da Venda") por palavra-chave,
    em vez de exigir o nome técnico exato. """
    return _classificar_cabecalho(texto)[0]

def _celula_vazia(celula) -> bool:
    return celula is None or (isinstance(celula, str) and not celula.strip())

def _pontuar_linha_cabecalho(celulas) -> int:
    """ Quantos campos DIFERENTES conhecidos essa linha reconhece como
    cabeçalho. Texto longo é ignorado -- é título/frase solta, não nome de
    coluna (e uma frase longa pode conter uma palavra-chave por acaso). """
    campos = set()
    for celula in celulas:
        texto = _texto_de_celula(celula)
        if not texto or len(texto) > 50:
            continue
        campo, _ = _classificar_cabecalho(texto)
        if campo in CAMPOS_CONHECIDOS:
            campos.add(campo)
    return len(campos)

def _resolver_cabecalho(celulas) -> list[str]:
    """ Nomes de campo de cada coluna do cabeçalho. Quando duas colunas caem
    no mesmo campo, só a mais forte (e, empatando, a mais à esquerda) fica
    com o nome do campo -- a outra vira uma coluna sem significado, em vez de
    sobrescrever a primeira em silêncio. """
    candidatos = []
    for indice, celula in enumerate(celulas):
        campo, forca = _classificar_cabecalho(_texto_de_celula(celula))
        candidatos.append((indice, campo, forca))

    vencedor: dict = {}
    for indice, campo, forca in candidatos:
        if campo in CAMPOS_CONHECIDOS and (campo not in vencedor or (forca, indice) < vencedor[campo][0]):
            vencedor[campo] = ((forca, indice), indice)

    nomes = []
    for indice, campo, _ in candidatos:
        if campo in CAMPOS_CONHECIDOS and vencedor[campo][1] != indice:
            nomes.append(f"{campo}__coluna{indice}")
        else:
            nomes.append(campo)
    return nomes

def _linhas_de_matriz(matriz):
    """ Transforma linhas cruas (lista de células) em dicts campo -> valor.
    Procura o cabeçalho entre as primeiras linhas (a que reconhece mais
    campos) em vez de assumir que é a primeira -- planilha com título no topo
    só funciona assim. Se nada for reconhecido, cai no comportamento antigo:
    primeira linha não vazia. """
    linhas = [list(linha) for linha in matriz]

    melhor_indice, melhor_pontos = None, 0
    for indice, celulas in enumerate(linhas[:LINHAS_PROCURA_CABECALHO]):
        pontos = _pontuar_linha_cabecalho(celulas)
        if pontos > melhor_pontos:
            melhor_indice, melhor_pontos = indice, pontos

    if melhor_indice is None:
        melhor_indice = next((i for i, celulas in enumerate(linhas) if not all(_celula_vazia(c) for c in celulas)), None)
        if melhor_indice is None:
            return

    cabecalho = _resolver_cabecalho(linhas[melhor_indice])
    for celulas in linhas[melhor_indice + 1:]:
        if all(_celula_vazia(c) for c in celulas):
            continue
        yield dict(zip(cabecalho, celulas))

def _texto_de_celula(valor):
    """ Normaliza um valor de célula (CSV ou Excel) para string limpa.
    Excel guarda CPF/telefone sem formatação de texto como float (ex: 12345678901.0),
    então corrige isso antes de virar string. """
    if valor is None:
        return ""
    if isinstance(valor, float) and valor.is_integer():
        return str(int(valor))
    return str(valor).strip()

def _normalizar_cpf(cpf: str) -> str:
    """ Reduz o CPF a só dígitos e aplica a máscara padrão (000.000.000-00) --
    sem isso, uma planilha com CPF sem pontuação (ou com pontuação diferente)
    nunca bate com um cliente que já tem o CPF formatado desse outro jeito,
    tanto pra detectar duplicata no cadastro quanto pra casar venda com
    cliente pelo CPF. Só aplica a máscara com exatamente 11 dígitos --
    CPF incompleto/inválido devolve só os dígitos, sem forçar um formato
    que não faz sentido pro tamanho encontrado (a linha vira "inválida" mais
    adiante, não trava aqui). """
    digitos = re.sub(r"\D", "", cpf or "")
    if len(digitos) == 11:
        return f"{digitos[0:3]}.{digitos[3:6]}.{digitos[6:9]}-{digitos[9:11]}"
    return digitos

def _data_de_celula(valor):
    """ Normaliza uma data vinda de CSV (string) ou Excel (datetime/date) para 'YYYY-MM-DD'. """
    if valor is None:
        return None
    if hasattr(valor, "strftime"):
        return valor.strftime("%Y-%m-%d")

    texto = str(valor).strip()
    if not texto:
        return None

    # Já em ISO (aaaa-mm-dd[Thh:mm:ss]) -- comum em CSV exportado por outro
    # sistema, em vez de digitado à mão numa planilha.
    if re.match(r"^\d{4}-\d{2}-\d{2}", texto):
        return texto[:10]

    # dd/mm/aaaa ou dd-mm-aaaa -- formato de data mais comum no Brasil, tanto
    # em planilha digitada à mão quanto em CSV exportado do Excel em pt-BR.
    partida = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$", texto)
    if partida:
        dia, mes, ano = partida.groups()
        return f"{ano}-{mes.zfill(2)}-{dia.zfill(2)}"

    return texto or None

def _valor_de_celula(valor):
    """ Converte célula de valor monetário (número do Excel ou texto do CSV) para float. """
    if valor is None:
        return None
    if isinstance(valor, (int, float)):
        return float(valor)

    texto = str(valor).strip().replace("R$", "").replace(" ", "")
    if not texto:
        return None

    # Formato brasileiro usa ponto como separador de milhar e vírgula como
    # decimal (ex: "1.234,56") -- sem tratar isso à parte, sobrava "1.234.56"
    # (dois pontos) pro float() e a linha inteira era descartada como "inválida".
    if "," in texto:
        texto = texto.replace(".", "").replace(",", ".")

    try:
        return float(texto)
    except ValueError:
        return None

def _decodificar_csv(conteudo: bytes) -> str:
    """ Excel no Brasil costuma salvar CSV em cp1252 (Windows-1252), não UTF-8
    -- tenta UTF-8 primeiro (mais comum em exportação de outros sistemas) e
    cai pra cp1252 se der erro de decodificação, em vez de quebrar a
    importação inteira ou virar texto ilegível. """
    try:
        return conteudo.decode("utf-8-sig")
    except UnicodeDecodeError:
        return conteudo.decode("cp1252")

def _detectar_delimitador(texto: str) -> str:
    """ Excel no Brasil salva CSV com ; em vez de , (porque a vírgula já é o
    separador decimal do português) -- decide pelo que aparece mais vezes na
    linha de cabeçalho, em vez de assumir vírgula sempre. """
    primeira_linha = texto.split("\n", 1)[0]
    return ";" if primeira_linha.count(";") > primeira_linha.count(",") else ","

def _ler_linhas_csv(conteudo: bytes):
    texto = _decodificar_csv(conteudo)
    delimitador = _detectar_delimitador(texto)
    yield from _linhas_de_matriz(csv.reader(io.StringIO(texto), delimiter=delimitador))

def _ler_linhas_xlsx(conteudo: bytes, aba=None):
    """ aba=None usa a primeira aba do arquivo (por posição, não a "ativa" -- esse metadado
    reflete só qual aba estava selecionada quando alguém salvou o arquivo, não qual tem os
    dados certos). Pode passar o nome de outra aba explicitamente. """
    workbook = openpyxl.load_workbook(io.BytesIO(conteudo), data_only=True)
    planilha = workbook[workbook.sheetnames[0]] if aba is None else workbook[aba]
    yield from _linhas_de_matriz(planilha.iter_rows(values_only=True))

def _ler_todas_abas(conteudo: bytes, eh_xlsx: bool) -> dict:
    """ {nome_da_aba: [linhas]} -- CSV tem uma aba só (chamada "csv"). """
    if not eh_xlsx:
        return {"csv": list(_ler_linhas_csv(conteudo))}

    workbook = openpyxl.load_workbook(io.BytesIO(conteudo), data_only=True)
    return {
        nome: list(_linhas_de_matriz(workbook[nome].iter_rows(values_only=True)))
        for nome in workbook.sheetnames
    }

def _colunas_da_aba(linhas) -> set:
    return {c for c in linhas[0].keys() if c} if linhas else set()

def _detectar_abas_em(abas: dict):
    """ Examina TODAS as abas pelo conteúdo (não pela posição/nome) e identifica
    qual tem colunas de clientes (nome+cpf) e qual tem colunas de vendas
    (cpf+valor+data_da_venda). As duas podem ser a mesma aba (uma planilha de "uma linha
    por compra" serve pra extrair clientes únicos E importar cada venda).
    Retorna (aba_clientes, aba_vendas, colunas_por_aba) -- os dois primeiros são None
    se nenhuma aba qualificar. """
    aba_clientes = None
    aba_vendas = None
    colunas_por_aba = {}

    for nome, linhas in abas.items():
        colunas = _colunas_da_aba(linhas)
        colunas_por_aba[nome] = colunas

        if aba_clientes is None and {"nome", "cpf"}.issubset(colunas):
            aba_clientes = nome
        if aba_vendas is None and {"cpf", "valor", "data_da_venda"}.issubset(colunas):
            aba_vendas = nome

    return aba_clientes, aba_vendas, colunas_por_aba

def _detectar_abas(conteudo: bytes):
    return _detectar_abas_em(_ler_todas_abas(conteudo, eh_xlsx=True))

def _numero_positivo(valor):
    """ Primeiro número > 0 de uma célula ("12", 12, "12 meses", "1,5"); None
    quando não tem número nenhum (ex: "N/A (Apenas Tempo)"). """
    if valor is None:
        return None
    if isinstance(valor, (int, float)):
        numero = float(valor)
    else:
        achado = re.search(r"\d+(?:[.,]\d+)?", str(valor))
        if not achado:
            return None
        numero = float(achado.group(0).replace(",", "."))
    return numero if numero > 0 else None

def _registrar_servicos(linhas, cursor):
    """ Registra no catálogo os serviços citados numa planilha (coluna
    "Serviço"). Serve pra qualquer planilha que cite serviço -- de vendas ou
    de catálogo:
    - serviço novo entra no catálogo (com ciclo, se a planilha trouxer);
    - serviço que já existe só tem o ciclo atualizado quando a planilha traz um.
    Numa planilha com colunas de CICLO (catálogo), linha sem ciclo não vira
    serviço -- é título de seção ou linha de resumo ("Média de Intervalo"),
    não um serviço de verdade. Ciclo em meses vira dias (x30) e guarda a
    unidade pra reexibir do jeito que veio. Retorna (criados, atualizados). """
    if not linhas:
        return 0, 0

    eh_catalogo = any(k in linhas[0] for k in ("ciclo_meses", "ciclo_dias", "ciclo"))
    criados = atualizados = 0
    vistos = set()

    for linha in linhas:
        nome = _texto_de_celula(linha.get("servico"))
        if not nome or len(nome) > 100:
            continue

        meses = _numero_positivo(linha.get("ciclo_meses"))
        dias = _numero_positivo(linha.get("ciclo_dias")) or _numero_positivo(linha.get("ciclo"))
        if meses:
            dias_ciclo, unidade = round(meses * DIAS_POR_MES), "meses"
        elif dias:
            dias_ciclo, unidade = round(dias), "dias"
        else:
            dias_ciclo, unidade = None, None

        if eh_catalogo and dias_ciclo is None:
            continue

        chave = nome.lower()
        if chave in vistos:
            continue
        vistos.add(chave)

        cursor.execute("SELECT id, dias_ciclo, unidade_ciclo FROM servicos WHERE LOWER(nome) = %s;", (chave,))
        existente = cursor.fetchone()
        if existente:
            if dias_ciclo is not None and (existente[1] != dias_ciclo or existente[2] != unidade):
                cursor.execute(
                    "UPDATE servicos SET dias_ciclo = %s, unidade_ciclo = %s WHERE id = %s;",
                    (dias_ciclo, unidade, existente[0])
                )
                atualizados += 1
        else:
            cursor.execute(
                "INSERT INTO servicos (nome, dias_ciclo, unidade_ciclo) VALUES (%s, %s, %s);",
                (nome, dias_ciclo, unidade or "dias")
            )
            criados += 1

    return criados, atualizados

def _resolver_servico_id(nome_servico: str, cursor, cache: dict) -> int | None:
    """ Casa o texto da planilha com um serviço do catálogo pelo nome (sem
    diferenciar maiúscula/espaço nas pontas); cria um novo (sem dias_ciclo
    definido) se ainda não existir, pra não travar a importação esperando
    cadastro manual prévio. `cache` evita repetir a mesma consulta/criação
    pra cada linha da planilha que citar o mesmo serviço. """
    nome = (nome_servico or "").strip()
    if not nome:
        return None

    chave = nome.lower()
    if chave in cache:
        return cache[chave]

    cursor.execute("SELECT id FROM servicos WHERE LOWER(nome) = %s;", (chave,))
    linha = cursor.fetchone()
    if linha:
        cache[chave] = linha[0]
        return linha[0]

    cursor.execute("INSERT INTO servicos (nome) VALUES (%s) RETURNING id;", (nome,))
    novo_id = cursor.fetchone()[0]
    cache[chave] = novo_id
    return novo_id

def _processar_linhas_vendas(linhas, cursor):
    """ Insere vendas casando cada linha com um cliente já cadastrado pelo CPF.
    A coluna "Serviço" é opcional -- quando presente, casa (ou cria) no
    catálogo de serviços; ausente, a venda fica sem serviço (servico_id nulo).
    Retorna (vendas_inseridas, sem_cliente_correspondente, dados_invalidos). """
    inseridas = 0
    sem_cliente = 0
    invalidas = 0
    cache_servicos: dict = {}

    for linha in linhas:
        cpf = _normalizar_cpf(_texto_de_celula(linha.get("cpf")))
        valor = _valor_de_celula(linha.get("valor"))
        data_venda = _data_de_celula(linha.get("data_da_venda"))

        if not cpf or valor is None or not data_venda:
            invalidas += 1
            continue

        cursor.execute("SELECT id FROM clientes WHERE cpf = %s;", (cpf,))
        cliente = cursor.fetchone()
        if not cliente:
            sem_cliente += 1
            continue

        servico_id = _resolver_servico_id(_texto_de_celula(linha.get("servico")), cursor, cache_servicos)

        cursor.execute(
            "INSERT INTO vendas (cliente_id, valor, servico_id, data_da_venda) VALUES (%s, %s, %s, %s);",
            (cliente[0], valor, servico_id, data_venda)
        )
        inseridas += 1

    return inseridas, sem_cliente, invalidas

def _contar_servicos(cursor) -> int:
    cursor.execute("SELECT COUNT(*) FROM servicos;")
    return cursor.fetchone()[0]

def _tem_coluna_de_servico(abas: dict) -> bool:
    return any(linhas and "servico" in linhas[0] for linhas in abas.values())

def _descrever_colunas(colunas_por_aba: dict) -> str:
    """ Pra mensagem de erro: o que foi ENCONTRADO em cada aba, sem as colunas
    que perderam a disputa de campo (ruído interno). """
    return " | ".join(
        f'aba "{nome}": {", ".join(sorted(c for c in cols if "__coluna" not in c)) or "(vazia)"}'
        for nome, cols in colunas_por_aba.items()
    )

def _registrar_servicos_de_todas_as_abas(abas: dict, cursor):
    """ Toda aba com coluna de serviço registra seus serviços -- planilha de
    vendas ou de catálogo, com ou sem o resto dos dados de cliente. """
    criados = atualizados = 0
    for linhas in abas.values():
        if linhas and "servico" in linhas[0]:
            novos, alterados = _registrar_servicos(linhas, cursor)
            criados += novos
            atualizados += alterados
    return criados, atualizados

@router.post("/importar-clientes")
async def importar_clientes(arquivo: UploadFile = File(...)):
    """
    Lê uma planilha (.csv ou .xlsx) e cadastra o que ela trouxer, aba por aba,
    pelo CONTEÚDO das colunas -- não importa a ordem, o nome exato do cabeçalho
    nem se há título acima da tabela:
    - serviços: qualquer aba com coluna de serviço (Serviço, Produto, Item...)
      registra os serviços no catálogo; se a aba trouxer ciclo (em meses ou
      dias), o ciclo também é definido;
    - clientes: aba com nome e cpf (telefone, email e data_nascimento são
      opcionais -- telefone ausente vira "Não informado");
    - vendas: aba com cpf, valor e data -- cada linha casa com o cliente pelo CPF.
    """
    nome_arquivo = arquivo.filename.lower()
    eh_xlsx = nome_arquivo.endswith(".xlsx")
    if not (nome_arquivo.endswith(".csv") or eh_xlsx):
        return {"erro": "Formato inválido. Envie um arquivo .csv ou .xlsx"}

    try:
        conteudo = await arquivo.read()
        abas = _ler_todas_abas(conteudo, eh_xlsx)
        if all(not linhas for linhas in abas.values()):
            return {"erro": "A planilha está vazia."}

        aba_clientes, aba_vendas, colunas_por_aba = _detectar_abas_em(abas)
        if aba_clientes is None and not _tem_coluna_de_servico(abas):
            return {"erro": (
                "Não encontrei clientes (colunas nome e cpf) nem serviços (coluna Serviço) nessa planilha. "
                f"Colunas encontradas: {_descrever_colunas(colunas_por_aba)}"
            )}

        conexao = conectar_banco()
        cursor = conexao.cursor()

        servicos_antes = _contar_servicos(cursor)
        _, servicos_atualizados = _registrar_servicos_de_todas_as_abas(abas, cursor)

        resposta = {"mensagem": "Processamento concluído com sucesso!"}

        if aba_clientes is not None:
            inseridos = 0
            duplicados = 0
            incompletos = 0
            nomes_duplicados = 0

            for linha in abas[aba_clientes]:
                nome = _texto_de_celula(linha.get("nome"))
                # Telefone é importante pro resto do sistema (é como o WhatsApp é
                # aberto), mas não trava a importação -- vira "Não informado" na
                # ausência, igual já acontece com CPF/e-mail/nascimento na leitura.
                telefone = _texto_de_celula(linha.get("telefone")) or "Não informado"
                cpf = _normalizar_cpf(_texto_de_celula(linha.get("cpf")))
                email = _texto_de_celula(linha.get("email"))
                data_nasc = _data_de_celula(linha.get("data_nascimento"))

                if not nome or not cpf:
                    incompletos += 1
                    continue

                # CPF é o identificador de verdade (documento único por pessoa) --
                # nome NÃO é (duas pessoas reais diferentes podem se chamar
                # "Carlos Souza"), então dedup por CPF é o certo aqui.
                cursor.execute("SELECT id FROM clientes WHERE cpf = %s;", (cpf,))
                if cursor.fetchone():
                    duplicados += 1
                    continue

                # A tabela também tem um índice único em LOWER(nome)
                # (idx_clientes_nome_unico) -- uma segunda pessoa com o mesmo
                # nome (CPF diferente) esbarra nele na hora do INSERT. Usa
                # SAVEPOINT pra essa linha específica virar "duplicado" sem
                # invalidar a transação inteira e perder o resto do lote.
                cursor.execute("SAVEPOINT antes_insercao_cliente;")
                try:
                    cursor.execute(
                        "INSERT INTO clientes (nome, telefone, cpf, email, data_nascimento) VALUES (%s, %s, %s, %s, %s);",
                        (nome, telefone, cpf, email, data_nasc)
                    )
                    cursor.execute("RELEASE SAVEPOINT antes_insercao_cliente;")
                    inseridos += 1
                except Exception:
                    cursor.execute("ROLLBACK TO SAVEPOINT antes_insercao_cliente;")
                    nomes_duplicados += 1

            resposta["clientes_inseridos"] = inseridos
            resposta["clientes_ignorados_por_duplicidade"] = duplicados
            resposta["clientes_ignorados_por_dados_incompletos"] = incompletos
            resposta["clientes_ignorados_por_nome_duplicado"] = nomes_duplicados

            if aba_vendas is not None:
                vendas_inseridas, vendas_sem_cliente, _ = _processar_linhas_vendas(abas[aba_vendas], cursor)
                resposta["vendas_inseridas"] = vendas_inseridas
                resposta["vendas_ignoradas_sem_cliente_correspondente"] = vendas_sem_cliente

        resposta["servicos_criados"] = _contar_servicos(cursor) - servicos_antes
        resposta["servicos_atualizados"] = servicos_atualizados

        conexao.commit()
        cursor.close()
        conexao.close()

        return resposta

    except Exception as erro:
        return {"erro": f"Erro ao processar planilha: {str(erro)}"}

@router.post("/importar-vendas")
async def importar_vendas(arquivo: UploadFile = File(...)):
    """
    Lê uma planilha de vendas (.csv ou .xlsx) — uma linha por venda — e insere no
    histórico dos clientes já cadastrados, casando cada linha pelo CPF.
    Colunas obrigatórias: cpf, valor, data_da_venda. Se a planilha tiver coluna
    de serviço, os serviços são cadastrados no catálogo MESMO que faltem as
    colunas das vendas (aí só os serviços entram, e a resposta avisa).
    """
    nome_arquivo = arquivo.filename.lower()
    eh_xlsx = nome_arquivo.endswith(".xlsx")
    if not (nome_arquivo.endswith(".csv") or eh_xlsx):
        return {"erro": "Formato inválido. Envie um arquivo .csv ou .xlsx"}

    try:
        conteudo = await arquivo.read()
        abas = _ler_todas_abas(conteudo, eh_xlsx)
        if all(not linhas for linhas in abas.values()):
            return {"erro": "A planilha está vazia."}

        _, aba_vendas, colunas_por_aba = _detectar_abas_em(abas)
        tem_servicos = _tem_coluna_de_servico(abas)
        if aba_vendas is None and not tem_servicos:
            return {"erro": (
                "Não encontrei as colunas obrigatórias de vendas (cpf, valor, data da venda) nem uma coluna de serviço. "
                f"Colunas encontradas: {_descrever_colunas(colunas_por_aba)}"
            )}

        conexao = conectar_banco()
        cursor = conexao.cursor()

        servicos_antes = _contar_servicos(cursor)
        _, servicos_atualizados = _registrar_servicos_de_todas_as_abas(abas, cursor)

        resposta = {"mensagem": "Processamento concluído com sucesso!"}
        if aba_vendas is not None:
            inseridas, sem_cliente, invalidas = _processar_linhas_vendas(abas[aba_vendas], cursor)
            resposta["vendas_inseridas"] = inseridas
            resposta["vendas_ignoradas_sem_cliente_correspondente"] = sem_cliente
            resposta["vendas_ignoradas_por_dados_invalidos"] = invalidas
        else:
            resposta["vendas_inseridas"] = 0
            resposta["aviso"] = (
                "Não dá pra importar as vendas: faltam colunas (cpf, valor e data da venda). "
                "Só os serviços foram cadastrados."
            )

        resposta["servicos_criados"] = _contar_servicos(cursor) - servicos_antes
        resposta["servicos_atualizados"] = servicos_atualizados

        conexao.commit()
        cursor.close()
        conexao.close()

        return resposta

    except Exception as erro:
        return {"erro": f"Erro ao processar planilha de vendas: {str(erro)}"}

@router.post("/importar-servicos")
async def importar_servicos(arquivo: UploadFile = File(...)):
    """
    Cadastra serviços a partir de qualquer planilha (.csv ou .xlsx) com uma
    coluna de serviço -- catálogo (com ciclo em meses ou dias) ou até uma
    planilha de vendas, da qual só os nomes dos serviços interessam. Serviço
    que já existe só é alterado se a planilha trouxer ciclo pra ele.
    """
    nome_arquivo = arquivo.filename.lower()
    eh_xlsx = nome_arquivo.endswith(".xlsx")
    if not (nome_arquivo.endswith(".csv") or eh_xlsx):
        return {"erro": "Formato inválido. Envie um arquivo .csv ou .xlsx"}

    try:
        conteudo = await arquivo.read()
        abas = _ler_todas_abas(conteudo, eh_xlsx)
        if all(not linhas for linhas in abas.values()):
            return {"erro": "A planilha está vazia."}

        if not _tem_coluna_de_servico(abas):
            colunas_por_aba = {nome: _colunas_da_aba(linhas) for nome, linhas in abas.items()}
            return {"erro": (
                "Não encontrei uma coluna de serviço (Serviço, Produto, Item, Manutenção...) nessa planilha. "
                f"Colunas encontradas: {_descrever_colunas(colunas_por_aba)}"
            )}

        conexao = conectar_banco()
        cursor = conexao.cursor()

        criados, atualizados = _registrar_servicos_de_todas_as_abas(abas, cursor)

        conexao.commit()
        cursor.close()
        conexao.close()

        return {
            "mensagem": "Processamento concluído com sucesso!",
            "servicos_criados": criados,
            "servicos_atualizados": atualizados
        }

    except Exception as erro:
        return {"erro": f"Erro ao processar planilha de serviços: {str(erro)}"}

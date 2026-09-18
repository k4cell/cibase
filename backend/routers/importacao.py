import csv
import io
import unicodedata

import openpyxl
from fastapi import APIRouter, Depends, UploadFile, File

from auth import verificar_token
from database import conectar_banco

router = APIRouter(dependencies=[Depends(verificar_token)])

# Cada campo é reconhecido por QUALQUER cabeçalho que CONTENHA uma das palavras-chave
# (não precisa bater a frase inteira) -- assim "Nome do Cliente", "Nome Completo" e "nome"
# caem todos em "nome" sem precisar cadastrar cada variação manualmente.
# A ordem importa: regras mais específicas (ex: "data da venda") vêm antes das genéricas.
REGRAS_CABECALHO = [
    (("data da venda", "dia da venda", "data venda", "dia venda", "data_da_venda",
      "data da compra", "dia da compra", "data compra", "dia compra"), "data_da_venda"),
    (("nascimento",), "data_nascimento"),
    (("e-mail", "e mail", "email"), "email"),
    (("cpf",), "cpf"),
    (("telefone", "celular", "whatsapp", "fone"), "telefone"),
    (("nome",), "nome"),
    (("servico", "produto"), "servico"),
    (("valor", "receita"), "valor"),
]

def _mapear_cabecalho(texto: str) -> str:
    """ Reconhece cabeçalhos em português com acento/espaço e variações de redação
    (ex: "Nome do Cliente", "Data de Nascimento", "Dia da Venda") por palavra-chave,
    em vez de exigir o nome técnico exato. """
    normalizado = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode("ascii").strip().lower()
    for palavras_chave, campo in REGRAS_CABECALHO:
        if any(chave in normalizado for chave in palavras_chave):
            return campo
    return normalizado

def _texto_de_celula(valor):
    """ Normaliza um valor de célula (CSV ou Excel) para string limpa.
    Excel guarda CPF/telefone sem formatação de texto como float (ex: 12345678901.0),
    então corrige isso antes de virar string. """
    if valor is None:
        return ""
    if isinstance(valor, float) and valor.is_integer():
        return str(int(valor))
    return str(valor).strip()

def _data_de_celula(valor):
    """ Normaliza uma data vinda de CSV (string) ou Excel (datetime/date) para 'YYYY-MM-DD'. """
    if valor is None:
        return None
    if hasattr(valor, "strftime"):
        return valor.strftime("%Y-%m-%d")
    texto = str(valor).strip()
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
    try:
        return float(texto.replace(",", "."))
    except ValueError:
        return None

def _ler_linhas_csv(conteudo: bytes):
    texto = conteudo.decode("utf-8-sig")  # utf-8-sig evita erro com caracteres acentuados do Excel
    leitor = csv.DictReader(io.StringIO(texto))
    for linha in leitor:
        yield {_mapear_cabecalho(chave): valor for chave, valor in linha.items()}

def _ler_linhas_xlsx(conteudo: bytes, aba=None):
    """ aba=None usa a primeira aba do arquivo (por posição, não a "ativa" -- esse metadado
    reflete só qual aba estava selecionada quando alguém salvou o arquivo, não qual tem os
    dados certos). Pode passar o nome de outra aba explicitamente. """
    workbook = openpyxl.load_workbook(io.BytesIO(conteudo), data_only=True)
    planilha = workbook[workbook.sheetnames[0]] if aba is None else workbook[aba]

    linhas = planilha.iter_rows(values_only=True)
    primeira_linha = next(linhas, None)
    if primeira_linha is None:
        return

    cabecalho = [_mapear_cabecalho(_texto_de_celula(celula)) for celula in primeira_linha]
    for linha in linhas:
        if all(celula is None for celula in linha):
            continue
        yield dict(zip(cabecalho, linha))

def _detectar_abas(conteudo: bytes):
    """ Examina TODAS as abas do .xlsx pelo conteúdo (não pela posição/nome) e identifica
    qual tem colunas de clientes (nome+telefone+cpf) e qual tem colunas de vendas
    (cpf+valor+data_da_venda). As duas podem ser a mesma aba (uma planilha de "uma linha
    por compra" serve pra extrair clientes únicos E importar cada venda).
    Retorna (aba_clientes, aba_vendas, colunas_por_aba) -- os dois primeiros são None
    se nenhuma aba qualificar. """
    workbook = openpyxl.load_workbook(io.BytesIO(conteudo), read_only=True)
    nomes = workbook.sheetnames
    workbook.close()

    aba_clientes = None
    aba_vendas = None
    colunas_por_aba = {}

    for nome in nomes:
        linhas = list(_ler_linhas_xlsx(conteudo, aba=nome))
        colunas = {c for c in linhas[0].keys() if c} if linhas else set()
        colunas_por_aba[nome] = colunas

        if aba_clientes is None and {"nome", "telefone", "cpf"}.issubset(colunas):
            aba_clientes = nome
        if aba_vendas is None and {"cpf", "valor", "data_da_venda"}.issubset(colunas):
            aba_vendas = nome

    return aba_clientes, aba_vendas, colunas_por_aba

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
        cpf = _texto_de_celula(linha.get("cpf"))
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

@router.post("/importar-clientes")
async def importar_clientes(arquivo: UploadFile = File(...)):
    """
    Lê uma planilha de clientes (.csv ou .xlsx) e insere no banco em lote.
    Colunas obrigatórias: nome, telefone, cpf (email e data_nascimento são opcionais).

    Se o arquivo for .xlsx e tiver uma segunda aba (de preferência chamada "Vendas"),
    ela também é importada como histórico de vendas, casando cada linha por CPF.
    """
    nome_arquivo = arquivo.filename.lower()
    eh_xlsx = nome_arquivo.endswith(".xlsx")
    if not (nome_arquivo.endswith(".csv") or eh_xlsx):
        return {"erro": "Formato inválido. Envie um arquivo .csv ou .xlsx"}

    try:
        conteudo = await arquivo.read()
        nome_aba_vendas = None

        if eh_xlsx:
            aba_clientes, nome_aba_vendas, colunas_por_aba = _detectar_abas(conteudo)
            if aba_clientes is None:
                detalhes = " | ".join(
                    f'aba "{nome}": {", ".join(sorted(cols)) or "(vazia)"}'
                    for nome, cols in colunas_por_aba.items()
                )
                return {"erro": (
                    "Nenhuma aba da planilha tem as colunas obrigatórias (nome, telefone, cpf). "
                    f"{detalhes}"
                )}
            linhas = list(_ler_linhas_xlsx(conteudo, aba=aba_clientes))
        else:
            linhas = list(_ler_linhas_csv(conteudo))
            if not linhas:
                return {"erro": "A planilha está vazia."}
            colunas_disponiveis = {c for c in linhas[0].keys() if c}
            colunas_faltando = {"nome", "telefone", "cpf"} - colunas_disponiveis
            if colunas_faltando:
                return {"erro": (
                    f"A planilha não tem a(s) coluna(s) obrigatória(s): {', '.join(sorted(colunas_faltando))}. "
                    f"Colunas encontradas: {', '.join(sorted(colunas_disponiveis))}."
                )}

        conexao = conectar_banco()
        cursor = conexao.cursor()

        inseridos = 0
        duplicados = 0
        incompletos = 0

        for linha in linhas:
            nome = _texto_de_celula(linha.get("nome"))
            telefone = _texto_de_celula(linha.get("telefone"))
            cpf = _texto_de_celula(linha.get("cpf"))
            email = _texto_de_celula(linha.get("email"))
            data_nasc = _data_de_celula(linha.get("data_nascimento"))

            if not nome or not telefone or not cpf:
                incompletos += 1
                continue

            # Verifica duplicidade de CPF antes de gravar
            cursor.execute("SELECT id FROM clientes WHERE cpf = %s;", (cpf,))
            if cursor.fetchone():
                duplicados += 1
                continue

            comando_sql = """
                INSERT INTO clientes (nome, telefone, cpf, email, data_nascimento)
                VALUES (%s, %s, %s, %s, %s);
            """
            cursor.execute(comando_sql, (nome, telefone, cpf, email, data_nasc))
            inseridos += 1

        resposta = {
            "mensagem": "Processamento concluído com sucesso!",
            "clientes_inseridos": inseridos,
            "clientes_ignorados_por_duplicidade": duplicados,
            "clientes_ignorados_por_dados_incompletos": incompletos
        }

        if nome_aba_vendas:
            linhas_vendas = list(_ler_linhas_xlsx(conteudo, aba=nome_aba_vendas))
            vendas_inseridas, vendas_sem_cliente, _ = _processar_linhas_vendas(linhas_vendas, cursor)
            resposta["vendas_inseridas"] = vendas_inseridas
            resposta["vendas_ignoradas_sem_cliente_correspondente"] = vendas_sem_cliente

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
    Colunas obrigatórias: cpf, valor, data_da_venda.
    """
    nome_arquivo = arquivo.filename.lower()
    if nome_arquivo.endswith(".csv"):
        leitor_de_linhas = _ler_linhas_csv
    elif nome_arquivo.endswith(".xlsx"):
        leitor_de_linhas = _ler_linhas_xlsx
    else:
        return {"erro": "Formato inválido. Envie um arquivo .csv ou .xlsx"}

    try:
        conteudo = await arquivo.read()
        linhas = list(leitor_de_linhas(conteudo))

        if not linhas:
            return {"erro": "A planilha está vazia."}

        colunas_disponiveis = {c for c in linhas[0].keys() if c}
        colunas_faltando = {"cpf", "valor", "data_da_venda"} - colunas_disponiveis
        if colunas_faltando:
            return {"erro": (
                f"A planilha não tem a(s) coluna(s) obrigatória(s): {', '.join(sorted(colunas_faltando))}. "
                f"Colunas encontradas: {', '.join(sorted(colunas_disponiveis))}."
            )}

        conexao = conectar_banco()
        cursor = conexao.cursor()

        inseridas, sem_cliente, invalidas = _processar_linhas_vendas(linhas, cursor)

        conexao.commit()
        cursor.close()
        conexao.close()

        return {
            "mensagem": "Processamento concluído com sucesso!",
            "vendas_inseridas": inseridas,
            "vendas_ignoradas_sem_cliente_correspondente": sem_cliente,
            "vendas_ignoradas_por_dados_invalidos": invalidas
        }

    except Exception as erro:
        return {"erro": f"Erro ao processar planilha de vendas: {str(erro)}"}

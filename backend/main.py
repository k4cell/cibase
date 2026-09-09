import csv
import io
import unicodedata
import openpyxl
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
from datetime import datetime

# ==============================================================================
# CONFIGURAÇÕES INICIAIS DA API (MOTOR TIXA)
# ==============================================================================
app = FastAPI(title="Motor Backend - Projeto Tixa", version="0.9.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==============================================================================
# MODELOS DE DADOS
# ==============================================================================
class NovoCliente(BaseModel):
    nome: str
    telefone: str
    cpf: str 
    email: str 
    data_nascimento: str

class NovaVenda(BaseModel):
    cliente_id: int
    valor: float

class CredenciaisLogin(BaseModel):
    """ Molde para receber e-mail e senha do Frontend """
    email: str
    senha: str

# ==============================================================================
# CONEXÃO COM O BANCO DE DADOS
# ==============================================================================
def conectar_banco():
    return psycopg2.connect(
        host="localhost",
        database="tixa_db",
        user="postgres",
        password="cassi10",
        port="5432"
    )

# ==============================================================================
# ROTAS DE SEGURANÇA E LOGIN (VERSÃO 0.9)
# ==============================================================================
@app.post("/login")
def fazer_login(credenciais: CredenciaisLogin):
    """ 
    ROTA DE SEGURANÇA: Valida o acesso ao painel.
    MVP: Credenciais de Administrador Único fixadas no código.
    """
    EMAIL_ADMIN = "adm"
    SENHA_ADMIN = "123"

    if credenciais.email == EMAIL_ADMIN and credenciais.senha == SENHA_ADMIN:
        return {"mensagem": "Login efetuado com sucesso!"}
    else:
        return {"erro": "E-mail ou senha incorretos. Acesso negado."}

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
            COUNT(v.id) AS total_compras
        FROM clientes c
        LEFT JOIN vendas v ON c.id = v.cliente_id
        WHERE c.ativo = %s
        GROUP BY c.id, c.nome, c.telefone, c.cpf, c.email, c.data_nascimento
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
            "total_compras": int(cliente[8])
        }
        for cliente in clientes_do_banco
    ]

@app.get("/clientes")
def listar_clientes():
    try:
        return {"clientes": _buscar_clientes(ativo=True)}
    except Exception as erro:
        return {"erro": f"Falha na comunicação com o banco de dados: {erro}"}

@app.get("/clientes/arquivados")
def listar_clientes_arquivados():
    try:
        return {"clientes": _buscar_clientes(ativo=False)}
    except Exception as erro:
        return {"erro": f"Falha na comunicação com o banco de dados: {erro}"}

@app.get("/clientes/{cliente_id}/vendas")
def listar_vendas_do_cliente(cliente_id: int):
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()

        cursor.execute(
            "SELECT id, valor, data_da_venda FROM vendas WHERE cliente_id = %s ORDER BY data_da_venda DESC, id DESC;",
            (cliente_id,)
        )
        vendas_do_banco = cursor.fetchall()
        cursor.close()
        conexao.close()

        vendas_formatadas = [
            {"id": venda[0], "valor": float(venda[1]), "data_da_venda": str(venda[2])}
            for venda in vendas_do_banco
        ]
        return {"vendas": vendas_formatadas}
    except Exception as erro:
        return {"erro": f"Falha ao buscar vendas do cliente: {erro}"}

@app.post("/clientes")
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

@app.put("/clientes/{cliente_id}")
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

@app.delete("/clientes/{cliente_id}")
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

@app.put("/clientes/{cliente_id}/reativar")
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

@app.delete("/clientes/{cliente_id}/permanente")
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

# ==============================================================================
# ROTAS FINANCEIRAS
# ==============================================================================
@app.post("/vendas")
def registrar_venda(venda: NovaVenda):
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()
        
        comando_sql = "INSERT INTO vendas (cliente_id, valor, data_da_venda) VALUES (%s, %s, CURRENT_DATE);"
        cursor.execute(comando_sql, (venda.cliente_id, venda.valor))
        
        conexao.commit()
        cursor.close()
        conexao.close()
        return {"mensagem": "Venda registrada com sucesso!"}
    except Exception as erro:
        return {"erro": f"Erro interno ao registrar venda: {erro}"}

@app.get("/estatisticas")
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

ALIAS_CABECALHOS = {
    "nome": "nome",
    "telefone": "telefone",
    "celular": "telefone",
    "cpf": "cpf",
    "email": "email",
    "e-mail": "email",
    "data de nascimento": "data_nascimento",
    "data nascimento": "data_nascimento",
    "data_nascimento": "data_nascimento",
    "nascimento": "data_nascimento",
    "valor": "valor",
    "valor da venda": "valor",
    "receita": "valor",
    "data da venda": "data_da_venda",
    "data_da_venda": "data_da_venda",
    "data venda": "data_da_venda",
    "dia da venda": "data_da_venda",
    "dia_da_venda": "data_da_venda",
    "dia venda": "data_da_venda",
    "data": "data_da_venda",
    "dia": "data_da_venda",
}

def _mapear_cabecalho(texto: str) -> str:
    """ Aceita cabeçalhos em português com acento/espaço (ex: "Data de nascimento")
    além do nome técnico exato (ex: "data_nascimento"). """
    normalizado = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode("ascii").strip().lower()
    return ALIAS_CABECALHOS.get(normalizado, normalizado)

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
    """ aba=None usa a aba ativa (primeira). Pode passar o nome de outra aba. """
    workbook = openpyxl.load_workbook(io.BytesIO(conteudo), data_only=True)
    planilha = workbook.active if aba is None else workbook[aba]

    linhas = planilha.iter_rows(values_only=True)
    primeira_linha = next(linhas, None)
    if primeira_linha is None:
        return

    cabecalho = [_mapear_cabecalho(_texto_de_celula(celula)) for celula in primeira_linha]
    for linha in linhas:
        if all(celula is None for celula in linha):
            continue
        yield dict(zip(cabecalho, linha))

def _nome_aba_de_vendas(conteudo: bytes):
    """ Se o .xlsx tiver uma segunda aba, retorna o nome dela (preferindo uma chamada "Vendas").
    Retorna None se o arquivo só tiver uma aba (nada pra importar como vendas). """
    workbook = openpyxl.load_workbook(io.BytesIO(conteudo), read_only=True)
    nomes = workbook.sheetnames
    workbook.close()

    if len(nomes) < 2:
        return None

    for nome in nomes:
        normalizado = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode("ascii").strip().lower()
        if normalizado == "vendas":
            return nome

    return nomes[1]

def _processar_linhas_vendas(linhas, cursor):
    """ Insere vendas casando cada linha com um cliente já cadastrado pelo CPF.
    Retorna (vendas_inseridas, sem_cliente_correspondente, dados_invalidos). """
    inseridas = 0
    sem_cliente = 0
    invalidas = 0

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

        cursor.execute(
            "INSERT INTO vendas (cliente_id, valor, data_da_venda) VALUES (%s, %s, %s);",
            (cliente[0], valor, data_venda)
        )
        inseridas += 1

    return inseridas, sem_cliente, invalidas

@app.post("/importar-clientes")
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
        linhas = list(_ler_linhas_xlsx(conteudo) if eh_xlsx else _ler_linhas_csv(conteudo))

        if not linhas:
            return {"erro": "A planilha está vazia."}

        colunas_disponiveis = set(linhas[0].keys())
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

        if eh_xlsx:
            nome_aba_vendas = _nome_aba_de_vendas(conteudo)
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

@app.post("/importar-vendas")
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

        colunas_disponiveis = set(linhas[0].keys())
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
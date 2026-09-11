import csv
import io
import unicodedata
import openpyxl
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
from datetime import datetime, timedelta
import firebase_admin
from firebase_admin import credentials as firebase_credentials, auth as firebase_auth

# ==============================================================================
# AUTENTICAÇÃO (FIREBASE)
# ==============================================================================
# Inicializa o Admin SDK uma vez, na subida do servidor. O arquivo é secreto
# (dá poder de administrador sobre o projeto Firebase) -- por isso vive só no
# disco local e está no .gitignore, nunca commitado.
_credencial_firebase = firebase_credentials.Certificate("firebase-service-account.json")
firebase_admin.initialize_app(_credencial_firebase)

_esquema_bearer = HTTPBearer()

def verificar_token(credenciais: HTTPAuthorizationCredentials = Depends(_esquema_bearer)) -> dict:
    """
    Roda em TODA rota da API (aplicada globalmente lá embaixo, no FastAPI(...)).
    Confere se o token que o Angular mandou no header Authorization foi
    realmente emitido pelo Firebase pra este projeto, e se ainda não expirou.
    Se passar, devolve os dados do usuário (uid, email); se não, barra a
    requisição com 401 antes mesmo dela chegar na rota.
    """
    try:
        return firebase_auth.verify_id_token(credenciais.credentials)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido ou expirado.")

# ==============================================================================
# CONFIGURAÇÕES INICIAIS DA API (MOTOR TIXA)
# ==============================================================================
app = FastAPI(
    title="Motor Backend - Projeto Tixa",
    version="0.12.0",
    dependencies=[Depends(verificar_token)]  # exige token válido em toda rota
)

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

class ConfiguracoesAtualizacao(BaseModel):
    """ Régua de relacionamento: em quantos dias sem comprar um cliente vira
    "Atenção" e depois "Risco Alto". Configurável porque o ciclo de retorno
    varia muito por nicho (ex: estética ~30 dias, oficina/automotivo ~180 dias). """
    dias_atencao: int
    dias_risco: int

class AdiarContato(BaseModel):
    """ Empurra proximo_contato_em pra frente, tirando o cliente da fila de
    hoje até essa data. Usado tanto pra "adiar" (poucos dias) quanto pra
    "recusou" (bem mais dias) -- é o mesmo mecanismo, só muda a quantidade. """
    dias: int

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
# CONFIGURAÇÕES DO NEGÓCIO (régua de relacionamento / farol de risco)
# ==============================================================================
@app.get("/configuracoes")
def obter_configuracoes():
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()
        cursor.execute("SELECT dias_atencao, dias_risco FROM configuracoes ORDER BY id LIMIT 1;")
        linha = cursor.fetchone()
        cursor.close()
        conexao.close()

        if not linha:
            return {"dias_atencao": 30, "dias_risco": 90}
        return {"dias_atencao": linha[0], "dias_risco": linha[1]}
    except Exception as erro:
        return {"erro": f"Erro ao buscar configurações: {erro}"}

@app.put("/configuracoes")
def atualizar_configuracoes(config: ConfiguracoesAtualizacao):
    if config.dias_atencao <= 0 or config.dias_risco <= 0:
        return {"erro": "Os prazos precisam ser maiores que zero."}
    if config.dias_atencao >= config.dias_risco:
        return {"erro": "O prazo de 'Atenção' precisa ser menor que o de 'Risco Alto'."}

    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()

        cursor.execute("SELECT id FROM configuracoes ORDER BY id LIMIT 1;")
        linha = cursor.fetchone()

        if linha:
            cursor.execute(
                "UPDATE configuracoes SET dias_atencao = %s, dias_risco = %s WHERE id = %s;",
                (config.dias_atencao, config.dias_risco, linha[0])
            )
        else:
            cursor.execute(
                "INSERT INTO configuracoes (dias_atencao, dias_risco) VALUES (%s, %s);",
                (config.dias_atencao, config.dias_risco)
            )

        conexao.commit()
        cursor.close()
        conexao.close()
        return {"mensagem": "Configurações atualizadas com sucesso!"}
    except Exception as erro:
        return {"erro": f"Erro ao atualizar configurações: {erro}"}

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

@app.put("/clientes/{cliente_id}/adiar")
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

@app.get("/estatisticas/receita-mensal")
def obter_receita_mensal(unidade: str = "mes", quantidade: int = 12, passo: int = 1):
    """ Receita e quantidade de vendas agrupadas por semana (unidade=semana, com
    `passo` semanas por bloco), mês (padrão) ou ano (unidade=ano), incluindo
    períodos sem nenhuma venda com valor 0. """
    if unidade == "ano":
        return _receita_por_ano(quantidade)
    if unidade == "semana":
        return _receita_por_semana(quantidade, passo)
    return _receita_por_mes(quantidade)

@app.get("/estatisticas/clientes-periodo")
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
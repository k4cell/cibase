from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
from datetime import datetime 

# ==============================================================================
# CONFIGURAÇÕES INICIAIS DA API (MOTOR TIXA)
# ==============================================================================
app = FastAPI(title="Motor Backend - Projeto Tixa", version="0.8.1")

# Configuração de CORS: Autoriza o frontend (Angular) a fazer requisições seguras para esta API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==============================================================================
# MODELOS DE DADOS (DATA TRANSFER OBJECTS - DTOs)
# ==============================================================================
class NovoCliente(BaseModel):
    """ Molde obrigatório para o recebimento de dados de clientes vindos do Frontend """
    nome: str
    telefone: str
    cpf: str 
    email: str 
    data_nascimento: str

class NovaVenda(BaseModel):
    """ Molde obrigatório para o registro financeiro de novas vendas """
    cliente_id: int
    valor: float


# ==============================================================================
# CONEXÃO COM O BANCO DE DADOS
# ==============================================================================
def conectar_banco():
    """ 
    Estabelece e retorna a conexão com o PostgreSQL.
    NOTA PARA V0.9: Em produção, a senha não ficará aqui, usaremos Variáveis de Ambiente (.env).
    """
    return psycopg2.connect(
        host="localhost",
        database="tixa_db",
        user="postgres",
        password="cassi10",
        port="5432"
    )


# ==============================================================================
# ROTAS DE CLIENTES
# ==============================================================================

@app.get("/clientes")
def listar_clientes():
    """ 
    ROTA 1 (GET): Busca todos os clientes, cruzando dados com a tabela de vendas 
    para calcular a data da última compra e a receita total recuperada de cada um.
    """
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()
        
        comando_sql = """
            SELECT 
                c.id, c.nome, c.telefone, c.cpf, c.email, c.data_nascimento,
                MAX(v.data_da_venda) AS ultima_compra,
                COALESCE(SUM(v.valor), 0) AS valor_recuperado
            FROM clientes c
            LEFT JOIN vendas v ON c.id = v.cliente_id
            GROUP BY c.id, c.nome, c.telefone, c.cpf, c.email, c.data_nascimento
            ORDER BY c.id;
        """
        cursor.execute(comando_sql)
        clientes_do_banco = cursor.fetchall()
        cursor.close()
        conexao.close()
        
        # Formatação de dados brutos do banco para JSON limpo
        lista_formatada = []
        for cliente in clientes_do_banco:
            lista_formatada.append({
                "id": cliente[0], 
                "nome": cliente[1], 
                "telefone": cliente[2],
                "cpf": cliente[3] if cliente[3] else "Não informado", 
                "email": cliente[4] if cliente[4] else "Não informado",
                "data_nascimento": str(cliente[5]) if cliente[5] else "Não informado",
                "ultima_compra": str(cliente[6]) if cliente[6] else "Sem vendas",
                "valor_recuperado": float(cliente[7]) 
            })
            
        return {"clientes": lista_formatada}
    
    except Exception as erro:
        return {"erro": f"Falha na comunicação com o banco de dados: {erro}"}


@app.post("/clientes")
def criar_cliente(cliente: NovoCliente):
    """ 
    ROTA 2 (POST): Cadastra um novo cliente com dupla validação (Tempo e Duplicidade de CPF).
    """
    try:
        # 1. Validação de Regra de Negócio: Escudo Temporal
        if cliente.data_nascimento and cliente.data_nascimento != "Não informado":
            try:
                data_nasc_obj = datetime.strptime(cliente.data_nascimento, "%Y-%m-%d").date()
                hoje = datetime.now().date()
                
                if data_nasc_obj > hoje:
                    return {"erro": "A data de nascimento não pode estar no futuro!"}
                
                if data_nasc_obj.year < 1945:
                    return {"erro": "O ano de nascimento não pode ser anterior a 1945!"}
                    
            except ValueError:
                return {"erro": "Formato de data inválido! Use YYYY-MM-DD."}

        conexao = conectar_banco()
        cursor = conexao.cursor()
        
        # 2. Validação de Regra de Negócio: Prevenção de CPF Duplicado
        cursor.execute("SELECT id FROM clientes WHERE cpf = %s;", (cliente.cpf,))
        if cursor.fetchone():
            cursor.close()
            conexao.close()
            return {"erro": "Este CPF já está cadastrado no sistema!"}

        # 3. Execução do Cadastro
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
    """ 
    ROTA 3 (PUT): Atualiza os dados de um cliente existente, garantindo que 
    o CPF editado não pertença acidentalmente a outra pessoa no sistema.
    """
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()
        
        # 1. Prevenção de conflito de CPF (Ignorando o ID do próprio cliente em edição)
        cursor.execute("SELECT id FROM clientes WHERE cpf = %s AND id != %s;", (cliente.cpf, cliente_id))
        if cursor.fetchone():
            cursor.close()
            conexao.close()
            return {"erro": "Este CPF já pertence a outro cliente!"}

        # 2. Execução da Atualização
        comando_sql = "UPDATE clientes SET nome = %s, telefone = %s, cpf = %s, email = %s, data_nascimento = %s WHERE id = %s;"
        cursor.execute(comando_sql, (cliente.nome, cliente.telefone, cliente.cpf, cliente.email, cliente.data_nascimento, cliente_id))
        
        linhas_afetadas = cursor.rowcount
        conexao.commit()
        cursor.close()
        conexao.close()
        
        if linhas_afetadas == 0:
            return {"erro": "Cliente não encontrado para edição."}
            
        return {"mensagem": "Cliente atualizado com sucesso!"}
        
    except Exception as erro:
        return {"erro": f"Erro interno ao atualizar cliente: {erro}"}


@app.delete("/clientes/{cliente_id}")
def apagar_cliente(cliente_id: int):
    """ 
    ROTA 4 (DELETE): Remove um cliente do banco. Se ele possuir vendas registradas,
    o banco (PostgreSQL) bloqueará a ação via integridade referencial (Foreign Key).
    """
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()
        
        comando_sql = "DELETE FROM clientes WHERE id = %s;"
        cursor.execute(comando_sql, (cliente_id,))
        
        linhas_afetadas = cursor.rowcount
        conexao.commit()
        cursor.close()
        conexao.close()
        
        if linhas_afetadas == 0:
            return {"erro": "Cliente não encontrado ou já apagado."}
            
        return {"mensagem": "Cliente apagado com sucesso!"}
        
    except Exception as erro:
        return {"erro": str(erro)}


# ==============================================================================
# ROTAS FINANCEIRAS E DE ESTATÍSTICAS (DASHBOARD)
# ==============================================================================

@app.post("/vendas")
def registrar_venda(venda: NovaVenda):
    """ 
    ROTA 5 (POST): Registra um novo pagamento/venda, vinculando o valor ao cliente.
    A data é salva automaticamente como a data atual do servidor (CURRENT_DATE).
    """
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
    """ 
    ROTA 6 (GET): Motor de cálculo do Dashboard de Receita Recuperada.
    Soma todos os valores faturados e conta quantos clientes únicos compraram.
    """
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()

        # 1. Total absoluto faturado
        cursor.execute("SELECT COALESCE(SUM(valor), 0) FROM vendas;")
        total_recuperado = cursor.fetchone()[0]

        # 2. Contagem de clientes reativados (exclusivos)
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
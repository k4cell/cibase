from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
from datetime import datetime 

# Inicializa a nossa API (O "Motor" do sistema)
app = FastAPI()

# Configuração de segurança que permite o Angular conversar com o Python sem ser bloqueado
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- MODELO DE DADOS ----------------
class NovoCliente(BaseModel):
    nome: str
    telefone: str
    cpf: str 
    email: str 
    data_nascimento: str

class NovaVenda(BaseModel):
    cliente_id: int
    valor: float

# ---------------- LIGAÇÃO AO BANCO ----------------
def conectar_banco():
    return psycopg2.connect(
        host="localhost",
        database="tixa_db",
        user="postgres",
        password="cassi10", # Sua senha do banco de dados
        port="5432"
    )

# ---------------- ROTAS ----------------

# ROTA 1: Ler todos os clientes (GET)
@app.get("/clientes")
def listar_clientes():
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()
        
        comando_sql = """
            SELECT 
                c.id, c.nome, c.telefone, c.cpf, c.email, c.data_nascimento,
                MAX(v.data_da_venda) AS ultima_compra
            FROM clientes c
            LEFT JOIN vendas v ON c.id = v.cliente_id
            GROUP BY c.id, c.nome, c.telefone, c.cpf, c.email, c.data_nascimento
            ORDER BY c.id;
        """
        cursor.execute(comando_sql)
        clientes_do_banco = cursor.fetchall()
        cursor.close()
        conexao.close()
        
        lista_formatada = []
        for cliente in clientes_do_banco:
            data_formatada = str(cliente[6]) if cliente[6] else "Sem vendas"
            nascimento_formatado = str(cliente[5]) if cliente[5] else "Não informado"
            
            lista_formatada.append({
                "id": cliente[0], 
                "nome": cliente[1], 
                "telefone": cliente[2],
                "cpf": cliente[3] if cliente[3] else "Não informado", 
                "email": cliente[4] if cliente[4] else "Não informado",
                "data_nascimento": nascimento_formatado,
                "ultima_compra": data_formatada 
            })
            
        return {"clientes": lista_formatada}
    except Exception as erro:
        return {"erro": f"Erro na ligação ou no SQL: {erro}"}
    
# ROTA 2: Criar um cliente novo (POST)
@app.post("/clientes")
def criar_cliente(cliente: NovoCliente):
    try:
        # --- NOVO ESCUDO TEMPORAL ---
        # 1. Verifica se a data foi informada e tenta convertê-la para o formato padrão
        if cliente.data_nascimento and cliente.data_nascimento != "Não informado":
            try:
                data_nasc_obj = datetime.strptime(cliente.data_nascimento, "%Y-%m-%d").date()
                hoje = datetime.now().date()
                
                # 2. Bloqueia viajantes do futuro (datas maiores que hoje)
                if data_nasc_obj > hoje:
                    return {"erro": "A data de nascimento não pode estar no futuro!"}
                
                # 3. Bloqueia datas excessivamente antigas (antes de 1945)
                if data_nasc_obj.year < 1945:
                    return {"erro": "O ano de nascimento não pode ser anterior a 1945!"}
                    
            except ValueError:
                # Se o usuário enviar "222222" ou qualquer texto não reconhecido, ele cai aqui
                return {"erro": "Formato de data inválido! Use YYYY-MM-DD."}
        # -----------------------------

        conexao = conectar_banco()
        cursor = conexao.cursor()
        
        # VERIFICAÇÃO DE CPF DUPLICADO
        cursor.execute("SELECT id FROM clientes WHERE cpf = %s;", (cliente.cpf,))
        resultado = cursor.fetchone() 
        
        if resultado:
            cursor.close()
            conexao.close()
            return {"erro": "Este CPF já está cadastrado no sistema!"}

        # INSERÇÃO CORRETA E ÚNICA COM A DATA DE NASCIMENTO
        comando_sql = "INSERT INTO clientes (nome, telefone, cpf, email, data_nascimento) VALUES (%s, %s, %s, %s, %s);"
        cursor.execute(comando_sql, (cliente.nome, cliente.telefone, cliente.cpf, cliente.email, cliente.data_nascimento))
        conexao.commit()
        cursor.close()
        conexao.close()
        return {"mensagem": "Cliente cadastrado com sucesso!"}
    except Exception as erro:
        # Agora, se o banco quebrar por outro motivo, ele continua retornando o erro geral
        return {"erro": f"Erro ao inserir cliente: {erro}"}

# ROTA 3: Editar um cliente existente (PUT)
@app.put("/clientes/{cliente_id}")
def atualizar_cliente(cliente_id: int, cliente: NovoCliente):
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()
        
        # 1. VERIFICAÇÃO DE CPF DUPLICADO NA EDIÇÃO
        cursor.execute("SELECT id FROM clientes WHERE cpf = %s AND id != %s;", (cliente.cpf, cliente_id))
        resultado = cursor.fetchone()
        
        if resultado:
            cursor.close()
            conexao.close()
            return {"erro": "Este CPF já pertence a outro cliente!"}

        # 2. ATUALIZAÇÃO INCLUINDO EMAIL E DATA DE NASCIMENTO
        comando_sql = "UPDATE clientes SET nome = %s, telefone = %s, cpf = %s, email = %s, data_nascimento = %s WHERE id = %s;"
        cursor.execute(comando_sql, (cliente.nome, cliente.telefone, cliente.cpf, cliente.email, cliente.data_nascimento, cliente_id))
        conexao.commit()
        linhas_afetadas = cursor.rowcount
        cursor.close()
        conexao.close()
        if linhas_afetadas == 0:
            return {"erro": "Cliente não encontrado para edição."}
        return {"mensagem": "Cliente atualizado com sucesso!"}
    except Exception as erro:
        return {"erro": f"Erro ao atualizar cliente: {erro}"}

# ROTA 4: Apagar um cliente (DELETE)
@app.delete("/clientes/{cliente_id}")
def apagar_cliente(cliente_id: int):
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()
        comando_sql = "DELETE FROM clientes WHERE id = %s;"
        cursor.execute(comando_sql, (cliente_id,))
        conexao.commit()
        
        linhas_afetadas = cursor.rowcount
        cursor.close()
        conexao.close()
        if linhas_afetadas == 0:
            return {"erro": "Cliente não encontrado ou já apagado."}
        return {"mensagem": "Cliente apagado com sucesso!"}
    except Exception as erro:
        return {"erro": str(erro)}

# ROTA 5: Registrar uma nova venda
@app.post("/vendas")
def registrar_venda(venda: NovaVenda):
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()
        
        # Insere a venda com a data de HOJE (CURRENT_DATE)
        comando_sql = "INSERT INTO vendas (cliente_id, valor, data_da_venda) VALUES (%s, %s, CURRENT_DATE);"
        cursor.execute(comando_sql, (venda.cliente_id, venda.valor))
        conexao.commit()
        
        cursor.close()
        conexao.close()
        return {"mensagem": "Venda registrada com sucesso!"}
    except Exception as erro:
        return {"erro": f"Erro ao registrar venda: {erro}"}
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2

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
# Aqui nós dizemos ao Python: "Sempre que recebermos um cliente novo do Angular, 
# ele TEM que ter nome, telefone, cpf e email, e tudo deve ser em formato de texto (str)".
class NovoCliente(BaseModel):
    nome: str
    telefone: str
    cpf: str 
    email: str 

# ---------------- LIGAÇÃO AO BANCO ----------------
# Função responsável por "abrir a porta" do PostgreSQL
def conectar_banco():
    return psycopg2.connect(
        host="localhost",
        database="tixa_db",
        user="postgres",
        password="cassi10", # Sua senha do banco de dados
        port="5432"
    )

# ---------------- ROTAS (O que o sistema faz) ----------------

# ROTA 1: Ler todos os clientes (GET)
@app.get("/clientes")
def listar_clientes():
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor() # O cursor é como se fosse o nosso "digitador" de comandos no banco
        
        # Puxa os dados do cliente e usa o LEFT JOIN para descobrir a data da última venda
        comando_sql = """
            SELECT 
                c.id, c.nome, c.telefone, c.cpf, c.email,
                MAX(v.data_da_venda) AS ultima_compra
            FROM clientes c
            LEFT JOIN vendas v ON c.id = v.cliente_id
            GROUP BY c.id, c.nome, c.telefone, c.cpf, c.email
            ORDER BY c.id;
        """
        cursor.execute(comando_sql)
        clientes_do_banco = cursor.fetchall() # Pega todas as respostas do banco
        
        cursor.close()
        conexao.close() # Sempre fechamos a porta após usar
        
        # Como o banco devolve os dados num formato "feio", nós arrumamos numa lista bonita
        lista_formatada = []
        for cliente in clientes_do_banco:
            data_formatada = str(cliente[5]) if cliente[5] else "Sem vendas"
            
            lista_formatada.append({
                "id": cliente[0], 
                "nome": cliente[1], 
                "telefone": cliente[2],
                "cpf": cliente[3] if cliente[3] else "Não informado", 
                "email": cliente[4] if cliente[4] else "Não informado",
                "ultima_compra": data_formatada 
            })
            
        return {"clientes": lista_formatada} # Devolvemos a lista arrumada para o Angular
    except Exception as erro:
        return {"erro": f"Erro na ligação ou no SQL: {erro}"}

# ROTA 2: Criar um cliente novo (POST)
@app.post("/clientes")
def criar_cliente(cliente: NovoCliente):
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()
        
        # 1. VERIFICAÇÃO DE CPF DUPLICADO
        # Procura na base de dados se já existe algum id com o CPF que o Angular enviou
        cursor.execute("SELECT id FROM clientes WHERE cpf = %s;", (cliente.cpf,))
        resultado = cursor.fetchone() # Tenta pegar uma linha de resposta
        
        # Se 'resultado' não for vazio, significa que o CPF já existe
        if resultado:
            cursor.close()
            conexao.close()
            return {"erro": "Este CPF já está cadastrado no sistema!"}

        # 2. SE O CPF FOR NOVO, SEGUE COM A GRAVAÇÃO NORMAL
        comando_sql = "INSERT INTO clientes (nome, telefone, cpf) VALUES (%s, %s, %s);"
        cursor.execute(comando_sql, (cliente.nome, cliente.telefone, cliente.cpf))
        conexao.commit()
        cursor.close()
        conexao.close()
        return {"mensagem": "Cliente cadastrado com sucesso!"}
    except Exception as erro:
        return {"erro": f"Erro ao inserir cliente: {erro}"}

@app.put("/clientes/{cliente_id}")
def atualizar_cliente(cliente_id: int, cliente: NovoCliente):
    try:
        conexao = conectar_banco()
        cursor = conexao.cursor()
        
        # 1. VERIFICAÇÃO DE CPF DUPLICADO NA EDIÇÃO
        # Procura se o CPF já existe, MAS ignora o ID do próprio cliente que estamos a editar
        # (afinal, ele pode estar a editar apenas o nome e manter o próprio CPF)
        cursor.execute("SELECT id FROM clientes WHERE cpf = %s AND id != %s;", (cliente.cpf, cliente_id))
        resultado = cursor.fetchone()
        
        if resultado:
            cursor.close()
            conexao.close()
            return {"erro": "Este CPF já pertence a outro cliente!"}

        # 2. SE PASSAR NA VERIFICAÇÃO, SEGUE COM A ATUALIZAÇÃO
        comando_sql = "UPDATE clientes SET nome = %s, telefone = %s, cpf = %s WHERE id = %s;"
        cursor.execute(comando_sql, (cliente.nome, cliente.telefone, cliente.cpf, cliente_id))
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
        # Se o banco bloquear a exclusão (porque o cliente tem vendas), o erro cai aqui
        return {"erro": str(erro)}
from pydantic import BaseModel


class NovoCliente(BaseModel):
    nome: str
    telefone: str
    cpf: str
    email: str
    data_nascimento: str


class NovaVenda(BaseModel):
    cliente_id: int
    valor: float
    servico_id: int | None = None


class NovoServico(BaseModel):
    """ Catálogo de serviços da empresa -- dias_ciclo é o nível 1 do fallback
    de ciclo esperado do motor de recomendação (a regra que a própria empresa
    configura pra aquele serviço, antes de cair pro ciclo do cliente/base). """
    nome: str
    dias_ciclo: int | None = None


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

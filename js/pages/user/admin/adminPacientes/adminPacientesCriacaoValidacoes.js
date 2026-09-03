// adminPacientesCriacaoValidacoes.js
//
// Validações do formulário de criação de paciente (passo Essencial).
// CPF, telefone e nome usam os MESMOS algoritmos já usados no
// cadastro de profissionais (mesma regra que o backend valida) -- ver
// adminProfissionaisValidacoes.js, de onde os três foram copiados.
// Se a regra mudar lá (ou aqui), replicar a mudança no outro arquivo
// também até existir um módulo verdadeiramente compartilhado entre os
// dois fluxos de cadastro.

const REGEX_NOME = /^[A-Za-zÀ-ÖØ-öø-ÿ'-]+$/;

const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24,
  27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46,
  47, 48, 49,
  51, 53, 54, 55,
  61,
  62, 64,
  63,
  65, 66,
  67,
  68,
  69,
  71, 73, 74, 75, 77,
  79,
  81, 87,
  82,
  83,
  84,
  85, 88,
  86, 89,
  91, 93, 94,
  92, 97,
  95,
  96,
  98, 99,
]);

function limparDigitos(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).replace(/\D/g, '');
}

export function validarCpf(valor) {
  const cpf = limparDigitos(valor);
  if (cpf.length !== 11) return false;
  if (cpf === cpf[0].repeat(11)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(cpf[i], 10) * (10 - i);
  let resto = (soma * 10) % 11;
  const d1 = resto < 10 ? resto : 0;
  if (d1 !== parseInt(cpf[9], 10)) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(cpf[i], 10) * (11 - i);
  resto = (soma * 10) % 11;
  const d2 = resto < 10 ? resto : 0;
  if (d2 !== parseInt(cpf[10], 10)) return false;

  return true;
}

export function validarTelefoneBr(valor) {
  const tel = limparDigitos(valor);
  if (tel.length !== 10 && tel.length !== 11) return false;

  const ddd = parseInt(tel.slice(0, 2), 10);
  if (!DDDS_VALIDOS.has(ddd)) return false;

  if (tel.length === 11 && tel[2] !== '9') return false;
  if (tel.length === 10 && !'2345'.includes(tel[2])) return false;

  const numero = tel.slice(2);
  if (numero === numero[0].repeat(numero.length)) return false;

  return true;
}

export function validarNomeCompleto(valor) {
  const partes = valor.trim().split(/\s+/);
  if (partes.length < 2) return 'Informe nome e sobrenome.';
  if (!partes.every(p => REGEX_NOME.test(p))) return 'Nome completo contém caracteres inválidos.';
  return null;
}

/**
 * Data de nascimento: precisa ser uma data real, não pode ser no
 * futuro, e (checagem de bom senso, não uma regra de negócio formal)
 * não pode implicar uma idade maior que 130 anos -- só para pegar
 * erro de digitação óbvio (ex: ano trocado), não é uma validação
 * médica.
 */
export function validarDataNascimento(valor) {
  if (!valor) return 'Informe a data de nascimento.';
  const data = new Date(`${valor}T00:00:00`);
  if (Number.isNaN(data.getTime())) return 'Data de nascimento inválida.';
  const hoje = new Date();
  if (data > hoje) return 'Data de nascimento não pode ser no futuro.';
  const idadeAproximada = hoje.getFullYear() - data.getFullYear();
  if (idadeAproximada > 130) return 'Data de nascimento inválida.';
  return null;
}

export function validarSexoBiologico(valor) {
  if (!['F', 'M', 'I'].includes(valor)) return 'Selecione o sexo biológico.';
  return null;
}

/**
 * Valida o passo "Essencial" do formulário de criação de paciente.
 *
 * @param {object} campos - valores brutos lidos do formulário
 * @returns {{ payload: object, erros: Record<string,string> }}
 */
export function validarEssencial(campos) {
  const erros = {};
  const payload = {};

  if (campos.nome) {
    const erro = validarNomeCompleto(campos.nome);
    if (erro) erros['pac-nome'] = erro;
    else payload.nome_completo = campos.nome.trim();
  } else {
    erros['pac-nome'] = 'Informe o nome completo.';
  }

  if (campos.cpf) {
    if (!validarCpf(campos.cpf)) erros['pac-cpf'] = 'O CPF está incorreto.';
    else payload.cpf = limparDigitos(campos.cpf);
  } else {
    erros['pac-cpf'] = 'Informe o CPF.';
  }

  if (campos.telefone) {
    if (!validarTelefoneBr(campos.telefone)) erros['pac-telefone'] = 'Telefone com formato inválido.';
    else payload.telefone = limparDigitos(campos.telefone);
  } else {
    erros['pac-telefone'] = 'Informe o telefone.';
  }

  if (campos.sexoBiologico) {
    const erro = validarSexoBiologico(campos.sexoBiologico);
    if (erro) erros['pac-sexo'] = erro;
    else payload.sexo_biologico = campos.sexoBiologico;
  } else {
    erros['pac-sexo'] = 'Selecione o sexo biológico.';
  }

  if (campos.dataNascimento) {
    const erro = validarDataNascimento(campos.dataNascimento);
    if (erro) erros['pac-nascimento'] = erro;
    else payload.data_nascimento = campos.dataNascimento;
  } else {
    erros['pac-nascimento'] = 'Informe a data de nascimento.';
  }

  // ---- campos opcionais do formulário completo (endereço, e-mail,
  // contato de emergência, tipo sanguíneo, primeiro atendimento) --
  // não fazem parte do "mínimo", mas se preenchidos, entram no mesmo
  // payload de POST /pacientes/pessoal/ (PacienteCriarSchema aceita
  // todos eles diretamente na criação -- confirmado contra o schema
  // real do backend).
  if (campos.email) payload.email = campos.email.trim().toLowerCase();
  if (campos.logradouro) payload.logradouro = campos.logradouro.trim();
  if (campos.numeroResidencia) payload.numero_residencia = campos.numeroResidencia.trim();
  if (campos.cep) payload.cep = limparDigitos(campos.cep);
  if (campos.contatoEmergenciaNome) payload.contato_emergencia_nome = campos.contatoEmergenciaNome.trim();
  if (campos.contatoEmergenciaTelefone) {
    payload.contato_emergencia_telefone = limparDigitos(campos.contatoEmergenciaTelefone);
  }
  if (campos.rg) payload.rg = campos.rg.trim();
  // tipo_sanguineo: PacienteCriarSchema aceita isso direto no payload
  // de criação -- por decisão confirmada, este é o ÚNICO caminho para
  // definir o tipo sanguíneo neste formulário (não existe mais um
  // POST separado para isso no fluxo de criação; o bloco "Dados
  // clínicos" do passo 4 cobre só alergias/medicamentos/doenças).
  if (campos.tipoSanguineo) payload.tipo_sanguineo = campos.tipoSanguineo;
  if (campos.dataPrimeiroAtendimento) payload.data_primeiro_atendimento = campos.dataPrimeiroAtendimento;
  // bairro: aceito pelo schema com prioridade sobre o valor resolvido
  // automaticamente a partir do CEP pelo CepService -- só sobrescreve
  // o automático quando informado; ausente, o backend resolve sozinho.
  if (campos.bairro) payload.bairro = campos.bairro.trim();

  return { payload, erros };
}
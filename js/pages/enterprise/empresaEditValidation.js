// empresaEditValidation.js
//
// Validação do formulário de edição de empresa (form-empresa-editar,
// em adminEmpresa.html). Mesmo padrão de enterpriseValidation.js
// (cadastro no fluxo "Junte-se a nós"): REGRAS por campo + validação
// genérica + validação específica onde necessário, e uma função única
// (validarFormularioEdicaoEmpresa) usada como portão antes do PUT.
//
// Só cobre os campos editáveis aqui (nome_fantasia, cnes, cep, bairro,
// numero, complemento) -- CNPJ e razão social são fixos nesta tela e
// não entram na validação de edição.
//
// Nenhum campo é `required` aqui, diferente do cadastro: numa edição,
// campo vazio = "mantém o valor atual" (placeholder), não "faltando".
// Forçar o usuário a redigitar um dado que já existe só porque o campo
// é obrigatório na tela de cadastro não faz sentido na tela de edição
// -- exigir preenchimento faz sentido para dado novo, não para reafirmar
// um dado que já está salvo. adminEmpresa.js resolve o fallback para o
// valor original antes de montar o payload do PUT.

const REGRAS = {
  'empresa-nome-fantasia': {
    label: 'o nome fantasia',
    minLength: 2,
    maxLength: 255,
    regex: /^[\p{L}\p{N}\s.,&\-'()]+$/u,
  },
  'empresa-cnes': {
    label: 'o CNES',
    // CNES: 7 dígitos numéricos
    regex: /^\d{7}$/,
    maxLength: 7,
  },
  'empresa-cep': {
    label: 'o CEP',
    regex: /^\d{5}-?\d{3}$/,
    maxLength: 9,
  },
  'empresa-bairro': {
    label: 'o bairro',
    minLength: 2,
    maxLength: 100,
    regex: /^[\p{L}\p{N}\s.,\-'()]+$/u,
  },
  'empresa-numero': {
    label: 'o número',
    maxLength: 10,
    regex: /^(\d{1,8}[A-Za-z]?|[sS]\/[nN])$/,
  },
  'empresa-complemento': {
    label: 'o complemento',
    maxLength: 150,
    regex: /^[\p{L}\p{N}\s.,\-'°ºª/]*$/u,
  },
};

function setError(fieldId, message) {
  const input = document.getElementById(fieldId);
  if (!input) return;
  const field = input.closest('.field');
  const errEl = document.getElementById('err-' + fieldId);
  if (field) field.classList.add('has-error');
  if (errEl) errEl.textContent = message;
}

function clearError(fieldId) {
  const input = document.getElementById(fieldId);
  if (!input) return;
  const field = input.closest('.field');
  const errEl = document.getElementById('err-' + fieldId);
  if (field) field.classList.remove('has-error');
  if (errEl) errEl.textContent = '';
}

function validarCampoPorRegra(fieldId) {
  const regra = REGRAS[fieldId];
  const input = document.getElementById(fieldId);
  if (!regra || !input) return true;

  const valor = input.value.trim();

  // Vazio = "mantém o valor atual" -- nunca é erro nesta tela (ver nota
  // no cabeçalho do arquivo sobre required não se aplicar em edição).
  if (valor.length === 0) {
    clearError(fieldId);
    return true;
  }

  if (regra.minLength && valor.length < regra.minLength) {
    setError(fieldId, `Mínimo de ${regra.minLength} caracteres`);
    return false;
  }

  if (regra.maxLength && valor.length > regra.maxLength) {
    setError(fieldId, `Máximo de ${regra.maxLength} caracteres`);
    return false;
  }

  if (regra.regex && !regra.regex.test(valor)) {
    setError(fieldId, `Formato inválido em ${regra.label}`);
    return false;
  }

  clearError(fieldId);
  return true;
}

function validarCepField() {
  const okFormato = validarCampoPorRegra('empresa-cep');
  if (!okFormato) return false;

  const input = document.getElementById('empresa-cep');
  if (input.value.trim().length === 0) return true; // vazio = mantém valor atual

  const cep = input.value.replace(/\D/g, '');
  if (cep.length !== 8) {
    setError('empresa-cep', 'CEP inválido');
    return false;
  }
  clearError('empresa-cep');
  return true;
}

// Liga blur + input condicional (só revalida enquanto digita se já
// havia erro visível), igual ao padrão do cadastro.
export function ligarValidacaoEmTempoReal() {
  const camposComRegraGenerica = [
    'empresa-nome-fantasia',
    'empresa-cnes',
    'empresa-bairro',
    'empresa-numero',
    'empresa-complemento',
  ];

  camposComRegraGenerica.forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('blur', () => validarCampoPorRegra(id));
    input.addEventListener('input', () => {
      const field = input.closest('.field');
      if (field && field.classList.contains('has-error')) {
        validarCampoPorRegra(id);
      }
    });
  });

  const cepInput = document.getElementById('empresa-cep');
  if (cepInput) {
    cepInput.addEventListener('blur', validarCepField);
  }
}

// ── aplicar erros vindos do backend nos campos correspondentes ──
// Mesmo mecanismo já usado em adminValidation.js/enterpriseValidation.js:
// o backend (_formatar_erros_pydantic) devolve "campo: msg; campo2: msg2",
// um segmento por erro de field_validator.
//
// Diferente daqueles dois, aqui os ids do DOM têm prefixo ('empresa-nome-
// fantasia', não 'nome_fantasia'), então precisa de uma tabela de
// tradução -- assume que o nome do campo no schema de edição de
// empresa é igual ao usado no cadastro (nome_fantasia, cnes, cep,
// bairro, numero, complemento). Ajustar aqui se o backend usar outro
// nome.
//
// Limitação igual à dos outros arquivos: erros de model_validator
// (cross-field, sem campo específico) não têm como ser mapeados e
// caem no residual retornado.
const CAMPOS_BACKEND_PARA_ID = {
  nome_fantasia: 'empresa-nome-fantasia',
  cnes: 'empresa-cnes',
  cep: 'empresa-cep',
  bairro: 'empresa-bairro',
  numero: 'empresa-numero',
  complemento: 'empresa-complemento',
};

export function aplicarErrosBackend(mensagem) {
  if (!mensagem) return '';

  const partesRestantes = [];

  mensagem.split(';').forEach((parte) => {
    const trecho = parte.trim();
    if (!trecho) return;

    const idx = trecho.indexOf(':');
    if (idx === -1) {
      partesRestantes.push(trecho);
      return;
    }

    const campo = trecho.slice(0, idx).trim();
    const msg = trecho.slice(idx + 1).trim();
    const id = CAMPOS_BACKEND_PARA_ID[campo];

    if (id && document.getElementById(id)) {
      setError(id, msg);
    } else {
      partesRestantes.push(trecho);
    }
  });

  return partesRestantes.join('; ');
}

export function validarFormularioEdicaoEmpresa() {
  const nomeFantasiaOk = validarCampoPorRegra('empresa-nome-fantasia');
  const cnesOk = validarCampoPorRegra('empresa-cnes');
  const cepOk = validarCepField();
  const bairroOk = validarCampoPorRegra('empresa-bairro');
  const numeroOk = validarCampoPorRegra('empresa-numero');
  const complementoOk = validarCampoPorRegra('empresa-complemento');

  return nomeFantasiaOk && cnesOk && cepOk && bairroOk && numeroOk && complementoOk;
}

export function limparErros() {
  Object.keys(REGRAS).forEach(clearError);
}
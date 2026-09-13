// validation.js
//
// Módulo dedicado de validação para o formulário de cadastro de empresa
// (form-empresa). Responsável por:
//   - validar formato, tamanho e caracteres permitidos de cada campo
//   - exibir/ocultar as mensagens de erro em vermelho (.error-msg / .has-error)
//   - expor uma função única (validarFormularioEmpresa) que retorna
//     true/false, para ser usada como "portão" antes de qualquer
//     chamada à API
//
// Este arquivo não faz máscaras de input nem chamadas de API — apenas
// validação. Import e uso típico em enterpriseRegistration.js:
//
//   import { validarFormularioEmpresa, ligarValidacaoEmTempoReal } from './validation.js';
//
//   ligarValidacaoEmTempoReal(); // opcional: valida enquanto o usuário digita
//
//   form.addEventListener('submit', async (e) => {
//     e.preventDefault();
//     if (!validarFormularioEmpresa()) return; // bloqueia envio
//     // ... segue para o fetch normalmente
//   });

// ── Regras de cada campo ─────────────────────────────────────
// regex: formato aceito (após trim). maxLength/minLength: limites de
// tamanho. required: obrigatório ou não.
const REGRAS = {
  cnpj: {
    label: 'o CNPJ',
    required: true,
    // aceita tanto "00.000.000/0000-00" quanto só dígitos
    regex: /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/,
    maxLength: 18,
  },
  nome_fantasia: {
    label: 'o nome fantasia',
    required: true,
    minLength: 2,
    maxLength: 255,
    // letras (com acentos), números, espaço e pontuação comum em nomes
    // de empresa. Bloqueia < > { } ; ` e outros caracteres de risco
    // (injeção de HTML/script) e símbolos sem uso legítimo no campo.
    regex: /^[\p{L}\p{N}\s.,&\-'()]+$/u,
  },
  razao_social: {
    label: 'a razão social',
    required: false,
    minLength: 2,
    maxLength: 255,
    // inclui "/" para permitir formatos como "Empresa X S/A"
    regex: /^[\p{L}\p{N}\s.,&\-'()/]+$/u,
  },
  cep: {
    label: 'o CEP',
    required: true,
    regex: /^\d{5}-?\d{3}$/,
    maxLength: 9,
  },
  bairro: {
    label: 'o bairro',
    required: true,
    minLength: 2,
    maxLength: 100,
    regex: /^[\p{L}\p{N}\s.,\-'()]+$/u,
  },
  numero: {
    label: 'o número',
    required: true,
    maxLength: 10,
    // número do endereço: dígitos, opcionalmente com sufixo tipo "120A"
    // ou "S/N". Não aceita símbolos soltos.
    regex: /^(\d{1,8}[A-Za-z]?|[sS]\/[nN])$/,
  },
  complemento: {
    label: 'o complemento',
    required: false,
    maxLength: 150,
    regex: /^[\p{L}\p{N}\s.,\-'°ºª/]*$/u,
  },
};

// Campos obrigatórios que possuem regra específica adicional além do
// que está em REGRAS (ex: dígito verificador do CNPJ).
function isValidCNPJ(cnpjValor) {
  const digits = cnpjValor.replace(/\D/g, '');
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false; // todos os dígitos iguais

  const calcDigito = (base, pesos) => {
    const soma = pesos.reduce((acc, peso, i) => acc + parseInt(base[i], 10) * peso, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const digito1 = calcDigito(digits.slice(0, 12), pesos1);
  if (digito1 !== parseInt(digits[12], 10)) return false;

  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const digito2 = calcDigito(digits.slice(0, 13), pesos2);
  if (digito2 !== parseInt(digits[13], 10)) return false;

  return true;
}

// ── UI: exibir / limpar erro ─────────────────────────────────
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

// ── Validação genérica por regra ─────────────────────────────
// Retorna true se válido; se inválido, já seta a mensagem de erro.
function validarCampoPorRegra(fieldId) {
  const regra = REGRAS[fieldId];
  const input = document.getElementById(fieldId);
  if (!regra || !input) return true;

  const valorBruto = input.value;
  const valor = valorBruto.trim();

  // vazio
  if (valor.length === 0) {
    if (regra.required) {
      setError(fieldId, `Informe ${regra.label}`);
      return false;
    }
    clearError(fieldId);
    return true; // opcional e vazio: ok
  }

  // tamanho mínimo
  if (regra.minLength && valor.length < regra.minLength) {
    setError(fieldId, `Mínimo de ${regra.minLength} caracteres`);
    return false;
  }

  // tamanho máximo
  if (regra.maxLength && valor.length > regra.maxLength) {
    setError(fieldId, `Máximo de ${regra.maxLength} caracteres`);
    return false;
  }

  // formato / caracteres permitidos
  if (regra.regex && !regra.regex.test(valor)) {
    setError(fieldId, `Formato inválido em ${regra.label}`);
    return false;
  }

  clearError(fieldId);
  return true;
}

// ── Validações específicas (além da regra genérica) ──────────
function validarCnpjField() {
  const okFormato = validarCampoPorRegra('cnpj');
  if (!okFormato) return false;

  const cnpj = document.getElementById('cnpj').value;
  if (!isValidCNPJ(cnpj)) {
    setError('cnpj', 'CNPJ inválido (dígito verificador não confere)');
    return false;
  }
  clearError('cnpj');
  return true;
}

function validarCepField() {
  const okFormato = validarCampoPorRegra('cep');
  if (!okFormato) return false;

  const cep = document.getElementById('cep').value.replace(/\D/g, '');
  if (cep.length !== 8) {
    setError('cep', 'CEP inválido');
    return false;
  }
  clearError('cep');
  return true;
}

function validarPlano() {
  const marcado = document.querySelector('input[name="plano"]:checked');
  return !!marcado;
}

// ── aplicar erros vindos do backend nos campos correspondentes ──
// Mesmo mecanismo do adminValidation.js -- ver comentário lá para o
// racional completo e a limitação com erros de model_validator
// (campo "(corpo)", sem input correspondente).
const CAMPOS_FORMULARIO_EMPRESA = [
  'cnpj', 'cnes', 'nome_fantasia', 'razao_social', 'cep', 'bairro',
  'numero', 'complemento',
];

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

    if (CAMPOS_FORMULARIO_EMPRESA.includes(campo) && document.getElementById(campo)) {
      setError(campo, msg);
    } else {
      partesRestantes.push(trecho);
    }
  });

  return partesRestantes.join('; ');
}

// ── Validação em tempo real (opcional) ───────────────────────
// Liga listeners de 'input'/'blur' para validar enquanto o usuário
// digita, sem esperar o submit. Chamar uma vez, ao carregar a página.
export function ligarValidacaoEmTempoReal() {
  const camposComRegraGenerica = [
    'nome_fantasia',
    'razao_social',
    'bairro',
    'numero',
    'complemento',
  ];

  camposComRegraGenerica.forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('blur', () => validarCampoPorRegra(id));
    input.addEventListener('input', () => {
      // só revalida enquanto digita se já havia erro visível,
      // para não incomodar o usuário a cada tecla
      const field = input.closest('.field');
      if (field && field.classList.contains('has-error')) {
        validarCampoPorRegra(id);
      }
    });
  });

  const cnpjInput = document.getElementById('cnpj');
  if (cnpjInput) {
    cnpjInput.addEventListener('blur', validarCnpjField);
  }

  const cepInput = document.getElementById('cep');
  if (cepInput) {
    cepInput.addEventListener('blur', validarCepField);
  }
}

// ── Validação completa do formulário (portão antes da API) ───
// Retorna true somente se TODOS os campos passarem. Sempre exibe/
// atualiza as mensagens de erro em vermelho correspondentes.
export function validarFormularioEmpresa() {
  const cnpjOk = validarCnpjField();
  const nomeFantasiaOk = validarCampoPorRegra('nome_fantasia');
  const razaoSocialOk = validarCampoPorRegra('razao_social');
  const cepOk = validarCepField();
  const bairroOk = validarCampoPorRegra('bairro');
  const numeroOk = validarCampoPorRegra('numero');
  const complementoOk = validarCampoPorRegra('complemento');
  const planoOk = validarPlano();

  const tudoValido =
    cnpjOk &&
    nomeFantasiaOk &&
    razaoSocialOk &&
    cepOk &&
    bairroOk &&
    numeroOk &&
    complementoOk &&
    planoOk;

  return tudoValido;
}

// Exporta também as validações individuais, caso seja necessário
// reusar em outro contexto (ex: passo 2 - adminRegistration).
export {
  isValidCNPJ,
  validarCampoPorRegra,
  validarCnpjField,
  validarCepField,
  setError,
  clearError,
};
// aplicarErrosBackend já é exportada com 'export function' acima.
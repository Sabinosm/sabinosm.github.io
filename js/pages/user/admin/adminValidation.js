// adminValidation.js
//
// Módulo dedicado de validação para o formulário de criação do
// administrador (form-admin). Responsável por:
//   - validar formato, tamanho e caracteres permitidos de cada campo
//   - exibir/ocultar as mensagens de erro em vermelho (.error-msg / .has-error)
//   - expor uma função única (validarFormularioAdmin) que retorna
//     true/false, para ser usada como "portão" antes de qualquer
//     chamada à API
//
// Este arquivo não faz máscaras de input nem chamadas de API — apenas
// validação. Import e uso típico em adminRegistration.js:
//
//   import { validarFormularioAdmin, ligarValidacaoEmTempoReal } from './adminValidation.js';
//
//   ligarValidacaoEmTempoReal(); // opcional: valida enquanto o usuário digita
//
//   form.addEventListener('submit', async (e) => {
//     e.preventDefault();
//     if (!validarFormularioAdmin()) return; // bloqueia envio
//     // ... segue para o fetch normalmente
//   });
//
// ALTERADO: validação de força de senha (validateSenhaField) deixou de
// ter regras próprias e passou a usar ../../../sharedConfig/passwordValidation.js
// -- o mesmo validador usado em settingsSenha.js (troca de senha nas
// configurações), que espelha validar_senha() do backend
// (src/core/validacoes.py). Antes deste ajuste, este arquivo tinha uma
// terceira cópia divergente das regras (máx. 50 caracteres, contra os
// 128 do backend) -- ver nota em passwordValidation.js sobre o risco
// de dessincronia entre as cópias client-side e a fonte da verdade.

import { validarSenha } from '../../../sharedConfig/passwordValidation.js';

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

// ── validações de formato por campo ──────────────────────────
function isValidCPF(cpf) {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false; // todos os dígitos iguais

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i], 10) * (10 - i);
  let check1 = (sum * 10) % 11;
  if (check1 === 10) check1 = 0;
  if (check1 !== parseInt(digits[9], 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i], 10) * (11 - i);
  let check2 = (sum * 10) % 11;
  if (check2 === 10) check2 = 0;
  if (check2 !== parseInt(digits[10], 10)) return false;

  return true;
}

function isValidEmail(email) {
  // local-part e domínio com limites de tamanho + apenas caracteres
  // seguros (letras, números, . _ % + - @); bloqueia < > " ' ; ` etc.
  return /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,}$/.test(email);
}

function isValidNome(nome) {
  // só letras (com acentos) e espaços, sem números ou símbolos
  return /^[A-Za-zÀ-ÖØ-öø-ÿ]+(\s[A-Za-zÀ-ÖØ-öø-ÿ]+)+$/.test(nome.trim());
}

function isValidTelefone(telefone) {
  const digits = telefone.replace(/\D/g, '');
  // fixo (10) ou celular (11) com DDD, sem contar máscara
  return digits.length === 10 || digits.length === 11;
}

function isValidLogin(login) {
  // letras, números, ponto, underline e hífen -- sem espaço e sem
  // caracteres de risco (< > " ' ; ` etc.)
  return /^[A-Za-z0-9._-]+$/.test(login);
}

function isValidUF(uf) {
  // mesma regra de schema_usuario.py (REGEX_UF): 2 letras, maiúsculas
  // ou não -- normalização de caixa é feita no backend.
  return /^[A-Za-z]{2}$/.test(uf.trim());
}

function isValidNumeroRegistro(numero) {
  // schema_usuario.py: só dígitos (CRM ou COREN)
  return /^\d+$/.test(numero.trim());
}

// ── validação por campo (usadas no submit e em tempo real) ──
function validateNomeField() {
  const nome = document.getElementById('nome_completo').value.trim();

  if (nome.length === 0) {
    setError('nome_completo', 'Informe o nome completo');
    return false;
  }
  if (nome.length > 60) {
    setError('nome_completo', 'Máximo de 60 caracteres');
    return false;
  }
  if (!isValidNome(nome)) {
    setError('nome_completo', 'Use apenas letras e espaços, sem números ou símbolos');
    return false;
  }
  clearError('nome_completo');
  return true;
}

function validateCpfField() {
  const cpf = document.getElementById('cpf').value;

  if (!isValidCPF(cpf)) {
    setError('cpf', 'CPF inválido');
    return false;
  }
  clearError('cpf');
  return true;
}

function validateTelefoneField() {
  const telefone = document.getElementById('telefone').value.trim();

  // campo opcional -- vazio é válido
  if (telefone.length === 0) {
    clearError('telefone');
    return true;
  }
  if (!isValidTelefone(telefone)) {
    setError('telefone', 'Telefone inválido');
    return false;
  }
  clearError('telefone');
  return true;
}

function validateEmailField() {
  const email = document.getElementById('email').value.trim();

  if (email.length === 0) {
    setError('email', 'Informe o e-mail');
    return false;
  }
  if (email.length > 50) {
    setError('email', 'Máximo de 50 caracteres');
    return false;
  }
  if (!isValidEmail(email)) {
    setError('email', 'E-mail inválido');
    return false;
  }
  clearError('email');
  return true;
}

function validateLoginField() {
  const login = document.getElementById('user_login').value.trim();

  if (login.length < 3 || login.length > 20) {
    setError('user_login', 'Deve ter entre 3 e 20 caracteres');
    return false;
  }
  if (/\s/.test(login)) {
    setError('user_login', 'Não pode conter espaços');
    return false;
  }
  if (!isValidLogin(login)) {
    setError('user_login', 'Use apenas letras, números, ponto, hífen ou underline');
    return false;
  }
  clearError('user_login');
  return true;
}

function validateSenhaField() {
  const senha = document.getElementById('senha').value;
  const { valida, mensagem } = validarSenha(senha);

  if (!valida) {
    setError('senha', mensagem);
    return false;
  }
  clearError('senha');
  return true;
}

// ── função clínica (médico/enfermeiro/nenhuma) ────────────────
// Espelha a regra cruzada de schema_usuario.py (valida_campos_por_profissao):
// cada tipo_papel exige seu próprio conjunto de campos, e nenhum dos
// dois conjuntos deve ser preenchido quando tipo_papel é null.
function getTipoPapelSelecionado() {
  const marcado = document.querySelector('input[name="tipo_papel"]:checked');
  return marcado && marcado.value ? marcado.value : null; // '' -> null
}

function validateCrmField() {
  const numero = document.getElementById('numero_crm').value.trim();
  const uf = document.getElementById('uf_crm').value.trim();
  let ok = true;

  if (numero.length === 0) {
    setError('numero_crm', 'Informe o CRM');
    ok = false;
  } else if (!isValidNumeroRegistro(numero)) {
    setError('numero_crm', 'CRM deve conter apenas números');
    ok = false;
  } else {
    clearError('numero_crm');
  }

  if (uf.length === 0) {
    setError('uf_crm', 'Informe a UF');
    ok = false;
  } else if (!isValidUF(uf)) {
    setError('uf_crm', 'UF deve ter 2 letras');
    ok = false;
  } else {
    clearError('uf_crm');
  }

  return ok;
}

function validateCorenField() {
  const numero = document.getElementById('numero_coren').value.trim();
  const uf = document.getElementById('uf_coren').value.trim();
  const especialidade = document.getElementById('especialidade').value.trim();
  let ok = true;

  if (numero.length === 0) {
    setError('numero_coren', 'Informe o COREN');
    ok = false;
  } else if (!isValidNumeroRegistro(numero)) {
    setError('numero_coren', 'COREN deve conter apenas números');
    ok = false;
  } else {
    clearError('numero_coren');
  }

  if (uf.length === 0) {
    setError('uf_coren', 'Informe a UF');
    ok = false;
  } else if (!isValidUF(uf)) {
    setError('uf_coren', 'UF deve ter 2 letras');
    ok = false;
  } else {
    clearError('uf_coren');
  }

  if (especialidade.length < 2) {
    setError('especialidade', 'Informe a especialidade');
    ok = false;
  } else {
    clearError('especialidade');
  }

  return ok;
}

// Valida somente o bloco correspondente ao tipo_papel selecionado.
// 'Nenhuma' não tem campos próprios para validar -- os campos do
// bloco escondido já são limpos no toggle (ver adminRegistration.js),
// então não há o que checar aqui.
function validateFuncaoClinica() {
  const tipo = getTipoPapelSelecionado();
  if (tipo === 'medico') return validateCrmField();
  if (tipo === 'enfermeiro') return validateCorenField();
  return true;
}

// ── conferência de senha em tempo real ──────
function checkPasswordsMatch() {
  const senha = document.getElementById('senha').value;
  const confirmar = document.getElementById('confirmar_senha').value;

  if (confirmar.length === 0) {
    clearError('confirmar_senha');
    return;
  }

  if (confirmar !== senha) {
    setError('confirmar_senha', 'As senhas não coincidem');
  } else {
    clearError('confirmar_senha');
  }
}

// ── validação em tempo real (opcional) ───────────────────────
// Liga listeners de 'input' para validar enquanto o usuário digita,
// sem esperar o submit. Chamar uma vez, ao carregar a página.
export function ligarValidacaoEmTempoReal() {
  document.getElementById('nome_completo').addEventListener('input', function () {
    if (this.closest('.field').classList.contains('has-error') || this.value.trim().length > 0) {
      validateNomeField();
    }
  });

  document.getElementById('cpf').addEventListener('input', validateCpfField);

  document.getElementById('telefone').addEventListener('input', function () {
    if (this.value.trim().length > 0) validateTelefoneField();
    else clearError('telefone');
  });

  document.getElementById('email').addEventListener('input', function () {
    if (this.value.trim().length > 0) validateEmailField();
    else clearError('email');
  });

  document.getElementById('user_login').addEventListener('input', function () {
    if (this.value.trim().length > 0) validateLoginField();
    else clearError('user_login');
  });

  document.getElementById('senha').addEventListener('input', function () {
    if (this.value.length > 0) validateSenhaField();
    else clearError('senha');
    checkPasswordsMatch();
  });

  document.getElementById('confirmar_senha').addEventListener('input', checkPasswordsMatch);

  // Campos de CRM/COREN só existem escondidos no DOM (não removidos),
  // então os listeners podem ser ligados de cara -- eles simplesmente
  // não disparam nada relevante enquanto 'Nenhuma' estiver selecionado
  // (o submit é o portão real; isso aqui só evita incomodar o usuário
  // a cada tecla antes de já haver erro visível).
  ['numero_crm', 'uf_crm'].forEach((id) => {
    document.getElementById(id).addEventListener('input', function () {
      if (this.closest('.field').classList.contains('has-error')) validateCrmField();
    });
  });

  ['numero_coren', 'uf_coren', 'especialidade'].forEach((id) => {
    document.getElementById(id).addEventListener('input', function () {
      if (this.closest('.field').classList.contains('has-error')) validateCorenField();
    });
  });
}

// ── aplicar erros vindos do backend nos campos correspondentes ──
// O backend (_formatar_erros_pydantic) devolve mensagens no formato
// "campo: msg; campo2: msg2" -- um segmento por erro de field_validator.
// Aqui a gente faz o parse e chama setError no campo certo, em vez de
// deixar tudo cair numa string só no #mensagemFeedback.
//
// Limitação conhecida: erros de model_validator (regra cruzada, ex:
// "Médicos precisam preencher CRM e UF") chegam com campo "(corpo)"
// -- não há como saber automaticamente em qual input pintar, então
// esses seguem para a mensagem geral (valor de retorno desta função).
const CAMPOS_FORMULARIO_ADMIN = [
  'nome_completo', 'cpf', 'telefone', 'email', 'user_login', 'senha',
  'confirmar_senha', 'numero_crm', 'uf_crm', 'numero_coren', 'uf_coren',
  'especialidade',
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

    if (CAMPOS_FORMULARIO_ADMIN.includes(campo) && document.getElementById(campo)) {
      setError(campo, msg);
    } else {
      partesRestantes.push(trecho);
    }
  });

  return partesRestantes.join('; ');
}

// ── validação completa do formulário (portão antes da API) ───
// Retorna true somente se TODOS os campos passarem. Sempre exibe/
// atualiza as mensagens de erro em vermelho correspondentes.
export function validarFormularioAdmin() {
  const nomeOk = validateNomeField();
  const cpfOk = validateCpfField();
  const telefoneOk = validateTelefoneField();
  const emailOk = validateEmailField();
  const loginOk = validateLoginField();
  const senhaOk = validateSenhaField();
  const funcaoClinicaOk = validateFuncaoClinica();

  const confirmar = document.getElementById('confirmar_senha').value;
  if (confirmar.length === 0) {
    setError('confirmar_senha', 'Confirme a senha');
  } else {
    checkPasswordsMatch();
  }
  const confirmarOk = !document.getElementById('confirmar_senha')
    .closest('.field').classList.contains('has-error');

  return nomeOk && cpfOk && telefoneOk && emailOk && loginOk && senhaOk &&
    funcaoClinicaOk && confirmarOk;
}

// Exporta também as validações individuais, caso seja necessário
// reusar em outro contexto.
export {
  isValidCPF,
  isValidEmail,
  isValidNome,
  isValidTelefone,
  isValidLogin,
  isValidUF,
  isValidNumeroRegistro,
  validateNomeField,
  validateCpfField,
  validateTelefoneField,
  validateEmailField,
  validateLoginField,
  validateSenhaField,
  getTipoPapelSelecionado,
  validateCrmField,
  validateCorenField,
  validateFuncaoClinica,
  checkPasswordsMatch,
  setError,
  clearError,
};
// aplicarErrosBackend já é exportada com 'export function' acima.
// adminProfissionaisValidações.js
//
// Validações do formulário de cadastro/edição de profissional,
// espelhando no front o que o backend valida em:
//   - CadastroUsuarioSchema (Pydantic)
//   - validador.py (validar_cpf, validar_telefone_br, validar_senha, etc.)
//
// Objetivo: pegar erro óbvio antes de bater na API, com a MESMA regra
// que o backend usa -- se uma regra mudar lá, precisa mudar aqui também.
// A validação real e definitiva continua sendo a do backend; isto aqui
// é só uma camada de UX que evita round-trip por erro bobo.
//
// Cadastro de profissional (médico/enfermeiro) não tem campo de senha:
// segundo o schema, só 'admin' informa senha no cadastro, e cadastro de
// admin é outro fluxo. Aqui a senha de acesso é definida pelo próprio
// profissional depois, via Google (login pelo e-mail cadastrado).

export const REGEX_LOGIN = /^[a-zA-Z0-9._-]{3,30}$/;
export const REGEX_NOME = /^[A-Za-zÀ-ÖØ-öø-ÿ'-]+$/;
export const REGEX_UF = /^[A-Za-z]{2}$/;

// DDDs válidos no Brasil (Anatel) -- mesma lista de validador.py,
// usada para rejeitar DDDs inexistentes (00, 10, 20, 23-24 etc.)
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

// ============================================
// CPF — mesmo algoritmo de validador.validar_cpf
// ============================================
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

// ============================================
// Telefone — mesmo algoritmo de validador.validar_telefone_br
// ============================================
export function validarTelefoneBr(valor) {
  const tel = limparDigitos(valor);
  if (tel.length !== 10 && tel.length !== 11) return false;

  const ddd = parseInt(tel.slice(0, 2), 10);
  if (!DDDS_VALIDOS.has(ddd)) return false;

  // Celular: 11 dígitos, terceiro dígito (primeiro do número) precisa ser 9
  if (tel.length === 11 && tel[2] !== '9') return false;

  // Fixo: primeiro dígito do número entre 2 e 5 (padrão Anatel)
  if (tel.length === 10 && !'2345'.includes(tel[2])) return false;

  // Rejeita número com todos os dígitos (após o DDD) repetidos
  const numero = tel.slice(2);
  if (numero === numero[0].repeat(numero.length)) return false;

  return true;
}

// ============================================
// Nome completo — mesma regra de valida_nome_completo
// ============================================
export function validarNomeCompleto(valor) {
  const partes = valor.trim().split(/\s+/);
  if (partes.length < 2) return 'Informe nome e sobrenome.';
  if (!partes.every(p => REGEX_NOME.test(p))) return 'Nome completo contém caracteres inválidos.';
  return null;
}

// ============================================
// Login — mesma regra de valida_login
// ============================================
export function validarLogin(valor) {
  if (!REGEX_LOGIN.test(valor)) {
    return 'Login deve ter 3-30 caracteres e conter apenas letras, números, ponto, hífen ou underline.';
  }
  return null;
}

// ============================================
// E-mail — checagem simples de formato (normalização para
// minúsculo já é feita no backend; aqui só validamos o shape)
// ============================================
export function validarEmail(valor) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) return 'E-mail inválido.';
  return null;
}

// ============================================
// UF — mesma regra de valida_uf (exatamente 2 letras)
// ============================================
export function validarUf(valor) {
  if (!REGEX_UF.test(valor.trim())) return 'UF deve conter exatamente 2 letras.';
  return null;
}

// ============================================
// Número de registro (CRM/COREN) — mesma regra de
// valida_numero_registro (apenas dígitos)
// ============================================
export function validarNumeroRegistro(valor) {
  if (!/^\d+$/.test(valor.trim())) return 'Número do registro deve conter apenas dígitos.';
  return null;
}

// ============================================
// Especialidade — mesma regra de valida_especialidade
// ============================================
export function validarEspecialidade(valor) {
  if (valor.trim().length < 2) return 'Especialidade inválida.';
  return null;
}

/**
 * Valida o formulário completo de cadastro/edição de profissional.
 *
 * @param {object} campos - valores brutos lidos do formulário
 * @param {boolean} editando - true = update parcial (campo vazio = não altera)
 * @returns {{ payload: object, erros: Record<string,string> }}
 */
export function validarFormularioProfissional(campos, editando) {
  const erros = {};
  const payload = {};

  // ---- nome_completo ----
  if (campos.nome) {
    const erro = validarNomeCompleto(campos.nome);
    if (erro) erros['pf-nome'] = erro;
    else payload.nome_completo = campos.nome.trim();
  } else if (!editando) {
    erros['pf-nome'] = 'Informe o nome completo.';
  }

  // ---- cpf ----
  if (campos.cpf) {
    if (!validarCpf(campos.cpf)) erros['pf-cpf'] = 'O CPF está incorreto.';
    else payload.cpf = limparDigitos(campos.cpf);
  } else if (!editando) {
    erros['pf-cpf'] = 'Informe o CPF.';
  }

  // ---- user_login ----
  if (campos.login) {
    const erro = validarLogin(campos.login);
    if (erro) erros['pf-login'] = erro;
    else payload.user_login = campos.login.trim().toLowerCase();
  } else if (!editando) {
    erros['pf-login'] = 'Informe o usuário de login.';
  }

  // ---- telefone (opcional em ambos os modos) ----
  if (campos.telefone) {
    if (!validarTelefoneBr(campos.telefone)) {
      erros['pf-telefone'] = 'Telefone com formato inválido.';
    } else {
      payload.telefone = limparDigitos(campos.telefone);
    }
  }

  // ---- email + confirmação ----
  if (campos.email || campos.emailConfirma) {
    if (!campos.email) {
      erros['pf-email'] = 'Informe o e-mail.';
    } else {
      const erroEmail = validarEmail(campos.email);
      if (erroEmail) erros['pf-email'] = erroEmail;
    }

    if (!campos.emailConfirma) {
      erros['pf-email-confirma'] = 'Confirme o e-mail.';
    } else if (!erros['pf-email'] && campos.email.trim().toLowerCase() !== campos.emailConfirma.trim().toLowerCase()) {
      erros['pf-email-confirma'] = 'Os e-mails não coincidem.';
    }

    if (!erros['pf-email'] && !erros['pf-email-confirma']) {
      payload.email = campos.email.trim().toLowerCase();
    }
  } else if (!editando) {
    erros['pf-email'] = 'Informe o e-mail.';
    erros['pf-email-confirma'] = 'Confirme o e-mail.';
  }

  // ---- tipo_usuario + campos condicionais ----
  // (cadastro de admin é outro fluxo -- aqui só medico/enfermeiro)
  if (campos.tipo) {
    payload.tipo_usuario = campos.tipo;
  } else if (!editando) {
    erros['pf-tipo'] = 'Selecione o tipo de profissional.';
  }

  if (campos.tipo === 'medico') {
    if (campos.crm) {
      const erro = validarNumeroRegistro(campos.crm);
      if (erro) erros['pf-crm'] = erro;
      else payload.numero_crm = campos.crm.trim();
    } else if (!editando) {
      erros['pf-crm'] = 'Informe o número do CRM.';
    }

    if (campos.ufCrm) {
      const erro = validarUf(campos.ufCrm);
      if (erro) erros['pf-uf-crm'] = erro;
      else payload.uf_crm = campos.ufCrm.trim().toUpperCase();
    } else if (!editando) {
      erros['pf-uf-crm'] = 'Informe a UF.';
    }

    if (campos.rqe) payload.rqe = campos.rqe.trim();
  } else if (campos.tipo === 'enfermeiro') {
    if (campos.coren) {
      const erro = validarNumeroRegistro(campos.coren);
      if (erro) erros['pf-coren'] = erro;
      else payload.numero_coren = campos.coren.trim();
    } else if (!editando) {
      erros['pf-coren'] = 'Informe o número do COREN.';
    }

    if (campos.ufCoren) {
      const erro = validarUf(campos.ufCoren);
      if (erro) erros['pf-uf-coren'] = erro;
      else payload.uf_coren = campos.ufCoren.trim().toUpperCase();
    } else if (!editando) {
      erros['pf-uf-coren'] = 'Informe a UF.';
    }

    if (campos.especialidade) {
      const erro = validarEspecialidade(campos.especialidade);
      if (erro) erros['pf-especialidade'] = erro;
      else payload.especialidade = campos.especialidade.trim();
    } else if (!editando) {
      erros['pf-especialidade'] = 'Informe a especialidade.';
    }
  }

  return { payload, erros };
}
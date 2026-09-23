// ============================================
// Utilitário: validação de força de senha (client-side)
//
// Uso:
//   import { validarSenha } from '../shared/passwordValidation.js';
//   const { valida, mensagem } = validarSenha(senha);
//   if (!valida) mostrarErroSenha(mensagem);
//
// IMPORTANTE: isto é só um pré-filtro para feedback rápido na UI.
// A validação real e definitiva é sempre feita pelo backend, em
// validar_senha() (src/core/validacoes.py) -- ver comentário em
// settingsSenha.js. As regras abaixo foram espelhadas manualmente
// daquela função; se ela mudar no backend, este arquivo precisa ser
// atualizado junto, ou o feedback do client fica dessincronizado
// (ex: aceitando no client algo que o backend rejeita, ou vice-versa).
//
// Regras espelhadas de validar_senha (validacoes.py):
//   - obrigatória, 12-128 caracteres
//   - pelo menos 1 dígito
//   - pelo menos 1 maiúscula
//   - pelo menos 1 caractere especial (ver ESPECIAIS_SEGUROS abaixo,
//     que replica o set `especiais_seguros` do backend -- OU qualquer
//     char não-alfanumérico, mesma lógica de
//     `c in especiais_seguros or not c.isalnum()`)
// ============================================

const SENHA_MIN_CARACTERES = 12;
const SENHA_MAX_CARACTERES = 128;

// Mesmo set de '!@#%^()-_=+[]{}/?~.,:<>\'"|;&$`\\' do backend.
const ESPECIAIS_SEGUROS = new Set(`!@#%^()-_=+[]{}/?~.,:<>'"|;&$\`\\`);

function ehAlfanumerico(c) {
  // Equivalente ao str.isalnum() do Python para o caso comum
  // (letras ASCII/acentuadas e dígitos). Unicode property escapes
  // exigem suporte a regex 'u', disponível em todos navegadores atuais.
  return /[\p{L}\p{N}]/u.test(c);
}

/**
 * Valida a força de uma senha, espelhando as regras do backend.
 * @param {string} senha
 * @returns {{ valida: boolean, mensagem: string }}
 *   mensagem é '' quando valida === true.
 */
export function validarSenha(senha) {
  if (!senha) {
    return { valida: false, mensagem: 'A senha é obrigatória.' };
  }

  if (senha.length < SENHA_MIN_CARACTERES) {
    return {
      valida: false,
      mensagem: `A senha precisa ter pelo menos ${SENHA_MIN_CARACTERES} caracteres.`,
    };
  }

  if (senha.length > SENHA_MAX_CARACTERES) {
    return {
      valida: false,
      mensagem: `A senha pode ter no máximo ${SENHA_MAX_CARACTERES} caracteres.`,
    };
  }

  const requisitosFaltando = [];

  if (![...senha].some((c) => c >= '0' && c <= '9')) {
    requisitosFaltando.push('número');
  }
  if (![...senha].some((c) => c !== c.toLowerCase() && c === c.toUpperCase())) {
    requisitosFaltando.push('letra maiúscula');
  }
  if (![...senha].some((c) => ESPECIAIS_SEGUROS.has(c) || !ehAlfanumerico(c))) {
    requisitosFaltando.push('caractere especial');
  }

  if (requisitosFaltando.length > 0) {
    return {
      valida: false,
      mensagem: `A senha precisa conter pelo menos: ${requisitosFaltando.join(', ')}.`,
    };
  }

  return { valida: true, mensagem: '' };
}
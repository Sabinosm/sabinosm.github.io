// adminRegistration.js
//
// Passo 2 de 2 do fluxo "Junte-se a nós": criação do administrador.
// O backend só persiste empresa+admin juntos (POST /empresa/create),
// então este passo não referencia uma empresa já criada -- ele lê os
// dados da empresa (preenchidos no passo 1) do sessionStorage e, ao
// concluir, envia tudo junto: { empresa: {...}, admin: {...} }.
//
// Validação de campos (formato, tamanho, caracteres) foi extraída para
// adminValidation.js -- este arquivo cuida de máscaras, sessionStorage
// e envio.
//
// Animação de fundo: /js/pages/user/admin/animations/particles.js
// Mensagens de feedback: /js/shared/feedback.js

import { exibirMensagem } from "../../../shared/feedback.js";
import { validarFormularioAdmin, ligarValidacaoEmTempoReal } from "./adminValidation.js";
import { URL_BASE_API } from "../../../urlConfig.js";

const CHAVE_SESSION_EMPRESA = 'bion_cadastro_empresa';
// Mesmo TTL usado em enterpriseRegistration.js -- dados mais velhos
// que isso são tratados como obsoletos (ex: aba esquecida aberta).
const TTL_SESSION_EMPRESA_MS = 30 * 60 * 1000; // 30 minutos

// ── dados da empresa (passo 1 -> passo 2) ───────────────────────
//
// Lidos do sessionStorage, gravados pelo enterpriseRegistration.js
// ao final do passo 1, junto com o timestamp de quando foram salvos.
// Sem eles (ou se estiverem expirados), este passo não faz sentido
// sozinho -- volta para o início do fluxo em vez de deixar submeter
// um admin órfão (o backend também rejeitaria por faltar `empresa`
// no corpo, mas o front não deveria nem oferecer a tela).
let dadosEmpresa = null;
try {
  const bruto = sessionStorage.getItem(CHAVE_SESSION_EMPRESA);
  const registro = bruto ? JSON.parse(bruto) : null;

  if (registro && registro.dados && registro.salvoEm) {
    const expirado = Date.now() - registro.salvoEm > TTL_SESSION_EMPRESA_MS;
    if (expirado) {
      sessionStorage.removeItem(CHAVE_SESSION_EMPRESA);
    } else {
      dadosEmpresa = registro.dados;
    }
  }
} catch (erro) {
  console.error('Erro ao ler dados da empresa do sessionStorage:', erro);
  dadosEmpresa = null;
}

if (!dadosEmpresa) {
  window.location.href = '../../../../html/pages/enterprise/enterpriseRegistration.html';
}

// Se o usuário sair desta página sem concluir o cadastro (fechar aba,
// voltar, navegar para outro lugar), os dados da empresa não têm mais
// utilidade parados no sessionStorage -- limpamos para reduzir o
// tempo que ficam expostos. Cadastro concluído com sucesso também já
// limpa explicitamente (ver bloco de envio).
let cadastroConcluido = false;
window.addEventListener('pagehide', function () {
  if (!cadastroConcluido) {
    sessionStorage.removeItem(CHAVE_SESSION_EMPRESA);
  }
});

// ── animação de fundo (partículas) ──────────
// Movida para /js/pages/user/admin/animations/particles.js (mesmo
// arquivo do login/onboarding) -- ver import do <script> no HTML.

// ── máscaras simples de cpf e telefone ──────
document.getElementById('cpf').addEventListener('input', function (e) {
  let v = e.target.value.replace(/\D/g, '').slice(0, 11);
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  e.target.value = v;
});

document.getElementById('telefone').addEventListener('input', function (e) {
  let v = e.target.value.replace(/\D/g, '').slice(0, 11);
  v = v.replace(/^(\d{2})(\d)/, '($1) $2');
  v = v.replace(/(\d{5})(\d{1,4})$/, '$1-$2');
  e.target.value = v;
});

// ── validação em tempo real (formato, tamanho, caracteres) ───
ligarValidacaoEmTempoReal();

// ── envio ────────────────────────────────────
document.getElementById('form-admin').addEventListener('submit', async function (e) {
  e.preventDefault();

  if (!validarFormularioAdmin()) return;

  // Segunda checagem: dadosEmpresa só é lido uma vez no carregamento
  // da página, então se o sessionStorage for limpo/expirar durante o
  // preenchimento, ainda pegamos isso aqui antes de tentar enviar.
  if (!dadosEmpresa) {
    exibirMensagem('Dados da empresa não encontrados. Reinicie o cadastro.', 'erro');
    window.location.href = '../../../../html/pages/enterprise/enterpriseRegistration.html';
    return;
  }

  const dadosAdmin = {
    nome_completo: document.getElementById('nome_completo').value.trim(),
    cpf: document.getElementById('cpf').value,
    email: document.getElementById('email').value.trim(),
    telefone: document.getElementById('telefone').value || null,
    user_login: document.getElementById('user_login').value.trim(),
    tipo_usuario: 'admin',
    senha: document.getElementById('senha').value,
  };

  const botao = this.querySelector('.btn-primary');
  botao.disabled = true;

  try {
    const resp = await fetch(`${URL_BASE_API}/empresas/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empresa: dadosEmpresa, admin: dadosAdmin }),
    });

    const corpo = await resp.json().catch(() => null);

    if (!resp.ok) {
      // json_error retorna { message, ... } com o motivo (ex: CNPJ
      // duplicado, e-mail já usado etc.)
      const mensagem = corpo?.message || 'Não foi possível concluir o cadastro.';
      exibirMensagem(mensagem, 'erro');
      return;
    }

    // Sucesso: dados da empresa não são mais necessários.
    cadastroConcluido = true;
    sessionStorage.removeItem(CHAVE_SESSION_EMPRESA);
    exibirMensagem('Cadastro concluído! Redirecionando para o login...', 'sucesso');
    setTimeout(() => {
      window.location.href = '../../../../html/pages/auth/login.html';
    }, 1500);
  } catch (erro) {
    console.error('Erro ao enviar cadastro:', erro);
    exibirMensagem('Erro de conexão. Tente novamente.', 'erro');
  } finally {
    botao.disabled = false;
  }
});
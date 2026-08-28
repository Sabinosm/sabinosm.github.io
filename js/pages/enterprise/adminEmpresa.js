// adminEmpresa.js
//
// Orquestra a página Empresa: busca os dados via GET /empresas/,
// popula a UI através de preencherEmpresa.js, e controla o modo de
// edição.
//
// Modo de edição: ao clicar "Alterar", cada input editável perde o
// valor atual (que vira placeholder) e fica habilitado -- o campo
// esvazia visualmente até o usuário digitar algo, mostrando o valor
// antigo como referência translúcida em vez de um valor "pronto pra
// apagar". Um campo deixado vazio no submit (placeholder ainda
// visível) é tratado como "sem mudança" e mantém o valor original,
// não é enviado como "".
//
// Campos editáveis: nome_fantasia, cnes, endereco (cep/bairro/numero/
// complemento). CNPJ e razão social ficam fixos -- exigem alteração de
// registro, não fazem parte deste formulário.
//
// Reaproveita os padrões já usados no cadastro de empresa
// (enterpriseRegistration.js / enterpriseValidation.js): mesmas
// máscaras de CEP, mesmo modelo de validação por campo com
// REGRAS + mensagens de erro em #err-<id>.

import { preencherPainelEmpresa } from './preencherEmpresa.js';
import { ligarValidacaoEmTempoReal, validarFormularioEdicaoEmpresa, limparErros } from './empresaEditValidation.js';
import { URL_BASE_API } from '../../config.js';
// ALTERADO (múltiplos admins por empresa): edição de empresa passou a
// ser restrita ao super admin no backend -- reaproveita o mesmo
// helper de sessão já usado na tela de Profissionais, em vez de
// duplicar a leitura de sessionStorage aqui.
import { souSuperAdmin } from '../user/admin/adminProfissionais/adminProfissionaisSessao.js';

const URL_BASE = `${URL_BASE_API}/empresas/`;

const CAMPOS_EDITAVEIS = [
  'empresa-nome-fantasia',
  'empresa-cnes',
  'empresa-cep',
  'empresa-bairro',
  'empresa-numero',
  'empresa-complemento',
];

let empresaAtual = null;

async function buscarEmpresa() {
  const resp = await fetch(URL_BASE, {
    method: 'GET',
    credentials: 'include', // sessão via cookie httpOnly, conforme a arquitetura de auth
  });

  const corpo = await resp.json().catch(() => null);

  if (!resp.ok) {
    const mensagem = corpo?.message ?? 'Não foi possível carregar os dados da empresa.';
    throw new Error(mensagem);
  }

  // Padrão json_success(data=...) do backend
  return corpo?.data ?? corpo;
}

async function atualizarEmpresa(dados) {
  const resp = await fetch(URL_BASE, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });

  const corpo = await resp.json().catch(() => null);

  if (!resp.ok) {
    const mensagem = corpo?.message ?? 'Não foi possível atualizar os dados da empresa.';
    throw new Error(mensagem);
  }

  return corpo?.data ?? corpo;
}

// ── máscaras (mesmas do cadastro, ver enterpriseRegistration.js) ──
function ligarMascaras() {
  const cepInput = document.getElementById('empresa-cep');
  if (!cepInput) return;

  cepInput.addEventListener('input', (e) => {
    let v = e.target.value.replace(/\D/g, '').slice(0, 8);
    v = v.replace(/(\d{5})(\d{1,3})$/, '$1-$2');
    e.target.value = v;
  });
}

// ── busca de CEP (ViaCEP -- mesmo serviço usado no cadastro, ver
// buscarDadosCep em enterpriseRegistration.js) ──────────────────
function setFieldLoading(fieldId, isLoading) {
  const field = document.getElementById(fieldId)?.closest('.field');
  field?.classList.toggle('is-loading', isLoading);
}

async function buscarDadosCep(cepLimpo) {
  setFieldLoading('empresa-cep', true);
  try {
    const resp = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);

    if (!resp.ok) {
      console.warn(`Consulta de CEP retornou status ${resp.status}`);
      return;
    }

    const dados = await resp.json();

    // ViaCEP responde 200 mesmo para CEP inexistente, sinalizando via
    // { erro: true } no corpo -- por isso o check é no JSON, não no status.
    if (dados.erro) {
      console.warn('CEP não encontrado na base do ViaCEP');
      return;
    }

    const bairroInput = document.getElementById('empresa-bairro');
    if (bairroInput) bairroInput.value = dados.bairro || '';
  } catch (erro) {
    console.error('Erro ao consultar CEP:', erro);
    // Falha de rede/parse não bloqueia a edição -- o campo continua
    // editável manualmente.
  } finally {
    setFieldLoading('empresa-cep', false);
  }
}

function ligarBuscaDeCep() {
  const cepInput = document.getElementById('empresa-cep');
  if (!cepInput) return;

  cepInput.addEventListener('input', function () {
    // Só dispara em modo de edição (campo habilitado) -- fora dele o
    // input é readonly e não deveria dar 'input' de qualquer forma,
    // mas a guarda evita disparo por preenchimento programático
    // (ex.: preencherPainelEmpresa setando .value ao carregar a página).
    if (this.readOnly) return;

    const digits = this.value.replace(/\D/g, '');
    if (digits.length === 8) buscarDadosCep(digits);
  });
}

// ── alternância modo exibição / edição ─────────────────────────
function entrarModoEdicao() {
  // Reforço: mesmo que o botão "Alterar" tenha sido acionado por algum
  // outro caminho (ex: reexibido manualmente via devtools), não entra
  // em modo de edição se quem está logado não é super admin -- o PUT
  // falharia no backend de qualquer forma.
  if (!souSuperAdmin()) return;

  CAMPOS_EDITAVEIS.forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    // valor atual vira placeholder (referência visível, translúcida)
    // -- o campo em si esvazia, para não parecer que o valor antigo
    // ainda é o que será salvo.
    input.placeholder = input.value;
    input.value = '';
    input.readOnly = false;
  });

  document.getElementById('empresa-form-actions').hidden = false;
  document.getElementById('empresa-btn-alterar').hidden = true;

  document.getElementById(CAMPOS_EDITAVEIS[0])?.focus();
}

function sairModoEdicao() {
  CAMPOS_EDITAVEIS.forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.readOnly = true;
    input.placeholder = '';
  });

  document.getElementById('empresa-form-actions').hidden = true;
  document.getElementById('empresa-btn-alterar').hidden = false;
  limparErros();
}

function cancelarEdicao() {
  // Descarta o que foi digitado -- repopula os inputs com os dados
  // atuais (a última resposta válida da API), não com o estado do form.
  if (empresaAtual) preencherPainelEmpresa(empresaAtual);
  sairModoEdicao();
}

/**
 * Lê um campo tratando "vazio, com placeholder visível" como
 * "sem mudança": devolve o valor digitado, ou o placeholder (valor
 * original) se o campo foi deixado em branco.
 */
function getValorEfetivo(id) {
  const input = document.getElementById(id);
  if (!input) return '';
  const digitado = input.value.trim();
  return digitado.length > 0 ? digitado : input.placeholder;
}

function lerFormularioComFallback() {
  return {
    nome_fantasia: getValorEfetivo('empresa-nome-fantasia'),
    cnes: getValorEfetivo('empresa-cnes') || null,
    endereco: {
      cep: getValorEfetivo('empresa-cep'),
      bairro: getValorEfetivo('empresa-bairro'),
      numero: getValorEfetivo('empresa-numero'),
      complemento: getValorEfetivo('empresa-complemento') || null,
    },
  };
}

async function salvarEdicao(evento) {
  evento.preventDefault();

  if (!validarFormularioEdicaoEmpresa()) {
    return;
  }

  const botaoSalvar = document.getElementById('empresa-btn-salvar');
  botaoSalvar.disabled = true;

  try {
    const dados = lerFormularioComFallback();
    empresaAtual = await atualizarEmpresa(dados);
    preencherPainelEmpresa(empresaAtual);
    sairModoEdicao();
  } catch (erro) {
    // TODO: usar o componente de feedback (exibirMensagem) quando ele
    // for promovido para um local compartilhado entre auth/ e admin/,
    // como já apontado em enterpriseRegistration.js.
    console.error('Erro ao atualizar empresa:', erro);
  } finally {
    botaoSalvar.disabled = false;
  }
}

function ligarControlesDeEdicao() {
  document.getElementById('empresa-btn-alterar')?.addEventListener('click', entrarModoEdicao);
  document.getElementById('empresa-btn-cancelar')?.addEventListener('click', cancelarEdicao);
  document.getElementById('form-empresa-editar')?.addEventListener('submit', salvarEdicao);
}

async function iniciar() {
  ligarMascaras();
  ligarBuscaDeCep();
  ligarValidacaoEmTempoReal();
  ligarControlesDeEdicao();

  // ADICIONADO (múltiplos admins por empresa): a rota PUT /empresas/
  // agora é restrita ao super admin no backend -- esconde o botão
  // "Alterar" para qualquer outro usuário (admin comum incluso), já
  // que a tentativa de edição sempre falharia no servidor. Feito antes
  // de qualquer outra coisa, para não haver um "flash" do botão
  // habilitado antes de ser escondido.
  if (!souSuperAdmin()) {
    const btnAlterar = document.getElementById('empresa-btn-alterar');
    if (btnAlterar) btnAlterar.hidden = true;
  }

  try {
    empresaAtual = await buscarEmpresa();
    preencherPainelEmpresa(empresaAtual);
  } catch (erro) {
    console.error('Erro ao carregar dados da empresa:', erro);
  }
}

document.addEventListener('DOMContentLoaded', iniciar);
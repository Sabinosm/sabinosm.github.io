// adminPacientesDetalheLista.js
//
// Orquestra a ficha do paciente (adminPacientesDetalhe.html) --
// SIMPLIFICADO: só dados pessoais (GET /pacientes/pessoal/<uuid>,
// protegido por step-up). Dados clínicos (alergias, medicamentos em
// uso, doenças crônicas) e consentimento LGPD NÃO são mais exibidos
// aqui -- passaram a ser registrados e geridos durante a CONSULTA
// (decisão de produto). Ver bloco "Dados clínicos" (placeholder) no
// HTML e TODO no fim deste arquivo.
//
// Fluxo:
//   1. lê o uuid da querystring (?uuid=...)
//   2. busca dados pessoais via buscarDetalhePessoal (pede step-up)
//   3. preenche header + seção "Dados pessoais"

import { ApiError, buscarDetalhePessoal } from "./adminPacientesApi.js";
import { ConfirmacaoCanceladaError } from "../../stepup.js";

document.addEventListener('DOMContentLoaded', () => {
  const uuid = new URLSearchParams(window.location.search).get('uuid');

  if (!uuid) {
    mostrarErro('Nenhum paciente informado na URL (parâmetro "uuid" ausente).');
    return;
  }

  configurarBotaoEditar();
  carregarFicha(uuid);
});

// ============================================
// Carregamento
// ============================================
async function carregarFicha(uuid) {
  try {
    const resposta = await buscarDetalhePessoal(uuid);

    if (!resposta) {
      // Usuário cancelou o step-up -- volta pra lista, já que sem os
      // dados não há ficha nenhuma pra mostrar.
      window.location.href = 'adminPacientes.html';
      return;
    }

    const dados = resposta.data;
    preencherHeader(dados);
    preencherPessoal(dados, dados.pessoal);

    document.getElementById('estado-carregando').hidden = true;
    document.getElementById('ficha-paciente').hidden = false;
  } catch (erro) {
    if (erro instanceof ConfirmacaoCanceladaError) {
      window.location.href = 'adminPacientes.html';
      return;
    }
    const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível carregar os dados do paciente.';
    mostrarErro(mensagem);
  }
}

function mostrarErro(texto) {
  document.getElementById('estado-carregando').hidden = true;
  const estadoErro = document.getElementById('estado-erro');
  estadoErro.hidden = false;
  document.getElementById('estado-erro-texto').textContent = texto;
}

// ============================================
// Header
// ============================================
function iniciais(nomeCompleto) {
  if (!nomeCompleto) return '';
  const partes = nomeCompleto.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}

function formatarData(isoOuData) {
  if (!isoOuData) return '—';
  const somenteData = String(isoOuData).slice(0, 10);
  const [ano, mes, dia] = somenteData.split('-');
  if (!ano || !mes || !dia) return somenteData;
  return `${dia}/${mes}/${ano}`;
}

function calcularIdade(dataNascimentoIso) {
  if (!dataNascimentoIso) return null;
  const nascimento = new Date(dataNascimentoIso);
  if (Number.isNaN(nascimento.getTime())) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - nascimento.getFullYear();
  const aindaNaoFezAniversario =
    hoje.getMonth() < nascimento.getMonth() ||
    (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() < nascimento.getDate());
  if (aindaNaoFezAniversario) idade -= 1;
  return idade;
}

function preencherHeader(dados) {
  const nome = dados.pessoal?.nome_completo ?? '';
  document.getElementById('patient-avatar-iniciais').textContent = iniciais(nome);
  document.getElementById('patient-nome').textContent = nome;

  const idade = calcularIdade(dados.data_nascimento);
  const partesMeta = [];
  if (idade !== null) partesMeta.push(`${idade} anos`);
  if (dados.sexo_biologico) partesMeta.push(SEXO_LABEL[dados.sexo_biologico] ?? dados.sexo_biologico);
  if (dados.tipo_sanguineo) partesMeta.push(`Tipo ${dados.tipo_sanguineo}`);
  document.getElementById('patient-meta').textContent = partesMeta.join(' · ');

  const badge = document.getElementById('patient-status-badge');
  if (dados.status === 'ativo') {
    badge.className = 'consult-status status--em-atendimento';
    badge.innerHTML = `<span class="status-dot"></span> Ativo`;
  } else if (dados.status === 'obito') {
    badge.className = 'consult-status status--inativo';
    badge.textContent = 'Óbito';
  } else {
    badge.className = 'consult-status status--inativo';
    badge.textContent = 'Inativo';
  }
}

// ============================================
// Seção "Dados pessoais" + "Gerenciamento"
// ============================================
const SEXO_LABEL = { F: 'Feminino', M: 'Masculino', I: 'Indeterminado' };
const STATUS_LABEL = { ativo: 'Ativo', inativo: 'Inativo', obito: 'Óbito' };

function preencherTexto(id, valor) {
  const el = document.getElementById(id);
  if (!el) return;
  if (valor === null || valor === undefined || valor === '') {
    el.textContent = '';
    el.classList.add('field-readonly--vazio');
  } else {
    el.textContent = valor;
    el.classList.remove('field-readonly--vazio');
  }
}

function preencherPessoal(dados, pessoal) {
  preencherTexto('pf-view-nome', pessoal?.nome_completo);
  preencherTexto('pf-view-cpf', pessoal?.cpf);
  preencherTexto('pf-view-rg', pessoal?.rg);
  preencherTexto('pf-view-nascimento', formatarData(dados.data_nascimento));
  preencherTexto('pf-view-sexo', SEXO_LABEL[dados.sexo_biologico] ?? dados.sexo_biologico);
  preencherTexto('pf-view-sangue', dados.tipo_sanguineo);
  preencherTexto('pf-view-telefone', pessoal?.telefone);
  preencherTexto('pf-view-email', pessoal?.email);

  const endereco = [pessoal?.logradouro, pessoal?.numero_residencia].filter(Boolean).join(', ');
  preencherTexto('pf-view-endereco', endereco);
  preencherTexto('pf-view-cep', pessoal?.cep);
  preencherTexto('pf-view-emergencia-nome', pessoal?.contato_emergencia_nome);
  preencherTexto('pf-view-emergencia-telefone', pessoal?.contato_emergencia_telefone);

  preencherTexto('pf-view-status', STATUS_LABEL[dados.status] ?? dados.status);
  preencherTexto('pf-view-primeiro-atendimento', formatarData(dados.data_primeiro_atendimento));
  preencherTexto('pf-view-cadastrado-por', dados.cadastrado_por);
  preencherTexto('pf-view-criado-em', formatarData(dados.criado_em));
}

// ============================================
// Botão "Editar" (dados pessoais) -- só design por enquanto.
//
// TODO (edição de dados pessoais, ainda não implementada):
//   #btn-editar-pessoal -> abrir formulário editável (provavelmente
//   um modal nos moldes de adminProfissionaisModal.js), usando
//   PacienteAtualizarPessoalSchema como contrato (PATCH parcial: só
//   os campos preenchidos são enviados/alterados). Rota de escrita
//   ainda não confirmada (provável PUT ou PATCH /pacientes/pessoal/<uuid>).
//   Provavelmente também precisa de step-up próprio (ação de escrita,
//   não a mesma "visualizar_paciente" já consumida no carregamento).
//
// TODO (dados clínicos, MOVIDO para o fluxo de consulta):
//   Alergias, medicamentos em uso, doenças crônicas e consentimento
//   LGPD deixaram de ser geridos nesta ficha -- são registrados
//   durante a consulta (ver adminPacientesCriacao.js, botão "Salvar e
//   iniciar consulta", ainda apontando para um placeholder). Quando o
//   módulo de Consultas existir, avaliar se esses dados também devem
//   voltar a aparecer aqui (mesmo que só como leitura) usando
//   buscarDetalheClinico/buscarDetalheCompleto, que já ficaram
//   prontas em adminPacientesApi.js para esse retorno.
// ============================================
function configurarBotaoEditar() {
  document.getElementById('btn-editar-pessoal')?.addEventListener('click', () => {
    console.log('TODO: editar dados pessoais -- ainda não implementado.');
  });
}
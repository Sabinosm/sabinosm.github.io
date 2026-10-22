// pacientesDetalheLista.js
//
// Orquestra a ficha do paciente (pacientesDetalhe.html):
//   - Dados pessoais  (GET /pacientes/pessoal/<uuid>)
//   - Histórico       (GET /consultas/paciente/historico/<uuid>,
//                      últimas 5 -- o repository limita)
//
// Permissões (derivadas do snapshot do /me -- ver
// userCachePermissoes.js; o front decide o que mostrar, o back é quem
// efetivamente bloqueia):
//   - admin (só 'gerenciar'): vê dados pessoais + histórico. NÃO vê
//     dados clínicos: a seção clínica fica escondida e o tipo sanguíneo
//     (que o back ainda embute no to_dict() de /pessoal/<uuid>) não é
//     exibido. Também não edita (botão "Editar" some). A rota
//     /pacientes/clinico/<uuid> já devolve 403 para admin no back.
//   - médico/enfermeiro ('atenderClinicamente'): vê tudo, inclusive o
//     botão "Ver detalhes" de cada consulta (que navega para a futura
//     página de detalhe da consulta).
//
// Sem step-up nas leituras: as rotas de detalhe do back usam
// acesso_auditado (só logam o acesso), não acao_sensivel -- ver
// pacientesApi.js.

import { ApiError, buscarDetalhePessoal, listarHistoricoConsultas } from "./pacientesApi.js";
import { getPermissoes, temAlguma } from "../../../../sharedConfig/userCacheHelpers/userCachePermissoes.js";
import { iniciarPagina } from "../../../../sharedConfig/loaders/initPagina.js";

// Derivado do cache do /me em DOMContentLoaded (o snapshot já existe
// neste ponto da página -- a ficha exige sessão).
let podeVerClinico = false;

document.addEventListener('DOMContentLoaded', () => {
  iniciarPagina();

  podeVerClinico = temAlguma(getPermissoes(), 'atenderClinicamente');

  const uuid = new URLSearchParams(window.location.search).get('uuid');
  if (!uuid) {
    mostrarErro('Nenhum paciente informado na URL (parâmetro "uuid" ausente).');
    return;
  }

  configurarBotaoEditar();
  aplicarPermissoesNaFicha();
  carregarFicha(uuid);
  carregarHistorico(uuid);
});

// ============================================
// Permissões na UI
// ============================================
function aplicarPermissoesNaFicha() {
  if (podeVerClinico) return;

  // Admin: a seção clínica (placeholder) não aparece.
  document.getElementById('painel-clinico')?.setAttribute('hidden', '');

  // Tipo sanguíneo é dado clínico: o back ainda o envia dentro do
  // to_dict() de /pessoal/<uuid> (com_pii=False só tira a chave
  // "pessoal", não os campos clínicos do próprio Paciente). Aqui não
  // exibimos -- endurecer a serialização no back é um TODO recomendado
  // (não devolver tipo_sanguineo/peso/altura para quem não é clínico).
  document.getElementById('pf-view-sangue')
    ?.closest('.field-readonly')
    ?.setAttribute('hidden', '');
}

// ============================================
// Carregamento — dados pessoais
// ============================================
async function carregarFicha(uuid) {
  try {
    const resposta = await buscarDetalhePessoal(uuid);
    const dados = resposta.data;
    preencherHeader(dados);
    preencherPessoal(dados, dados.pessoal);

    document.getElementById('estado-carregando').hidden = true;
    document.getElementById('ficha-paciente').hidden = false;
  } catch (erro) {
    const mensagem = erro instanceof ApiError
      ? erro.message
      : 'Não foi possível carregar os dados do paciente.';
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

function formatarDataHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${min}`;
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
  // Tipo sanguíneo é dado clínico -- não entra no header para admin.
  if (podeVerClinico && dados.tipo_sanguineo) partesMeta.push(`Tipo ${dados.tipo_sanguineo}`);
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
// Histórico de consultas
// ============================================
const STATUS_CONSULTA_LABEL = {
  'aguardando-triagem': 'Aguardando triagem',
  'em-triagem': 'Em triagem',
  'aguardando-medico': 'Aguardando médico',
  'em-atendimento': 'Em atendimento',
  'em-observacao': 'Em observação',
  'encerrada': 'Encerrada',
};
const ORIGEM_CONSULTA_LABEL = {
  espontanea: 'Espontânea',
  SAMU: 'SAMU',
  transferencia: 'Transferência',
  regulacao: 'Regulação',
};
const DESFECHO_CONSULTA_LABEL = {
  alta: 'Alta',
  internacao: 'Internação',
  transferencia: 'Transferência',
  obito: 'Óbito',
  evasao: 'Evasão',
};

async function carregarHistorico(uuid) {
  const container = document.getElementById('lista-historico-consultas');
  if (!container) return;

  try {
    const resposta = await listarHistoricoConsultas(uuid);
    const consultas = resposta.data || [];
    container.innerHTML = '';

    if (consultas.length === 0) {
      container.appendChild(criarEstadoVazioHistorico());
      return;
    }
    consultas.forEach(c => container.appendChild(criarCardConsulta(c)));
  } catch (erro) {
    const mensagem = erro instanceof ApiError
      ? erro.message
      : 'Não foi possível carregar o histórico de consultas.';
    container.innerHTML = '';
    container.appendChild(criarEstadoErroHistorico(mensagem));
  }
}

function criarCardConsulta(c) {
  const card = document.createElement('article');
  card.className = 'consult-card';

  const encerrada = c.status_consulta === 'encerrada';
  const status = document.createElement('div');
  if (encerrada) {
    status.className = 'consult-status status--inativo';
    status.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="9" stroke-linecap="round"/>
        <path d="M8 12l3 3 5-6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Encerrada`;
  } else {
    status.className = 'consult-status status--em-atendimento';
    status.innerHTML = `<span class="status-dot"></span> ${STATUS_CONSULTA_LABEL[c.status_consulta] ?? c.status_consulta}`;
  }

  const main = document.createElement('div');
  main.className = 'consult-main';

  const titulo = document.createElement('h3');
  titulo.className = 'consult-patient';
  titulo.textContent = `Consulta de ${formatarData(c.data_hora_inicio)}`;

  const meta = document.createElement('p');
  meta.className = 'consult-meta';
  const partes = [`Início ${formatarDataHora(c.data_hora_inicio)}`];
  partes.push(`Origem: ${ORIGEM_CONSULTA_LABEL[c.origem_encaminhamento] ?? c.origem_encaminhamento}`);
  if (c.data_hora_fim) partes.push(`Fim ${formatarDataHora(c.data_hora_fim)}`);
  if (c.desfecho_final) partes.push(`Desfecho: ${DESFECHO_CONSULTA_LABEL[c.desfecho_final] ?? c.desfecho_final}`);
  meta.textContent = partes.join(' · ');
  main.append(titulo, meta);

  // "Ver detalhes" só para o eixo clínico: a rota GET /consultas/<uuid>
  // só aceita médico/enfermeiro. Admin vê a lista do histórico, mas
  // não o conteúdo da consulta.
  if (podeVerClinico) {
    const btn = document.createElement('button');
    btn.className = 'btn-ghost';
    btn.textContent = 'Ver detalhes';
    btn.addEventListener('click', () => {
      // TODO: página de detalhe da consulta ainda não existe (módulo
      // Consultas). Quando existir, ajustar o nome do arquivo/fluxo
      // se necessário.
      window.location.href = `consultaDetalhe.html?uuid=${encodeURIComponent(c.uuid)}`;
    });
    card.append(status, main, btn);
  } else {
    card.append(status, main);
  }

  return card;
}

function criarEstadoVazioHistorico() {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.innerHTML = `
    <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="12" cy="12" r="9" stroke-linecap="round"/>
      <path d="M12 7v5l3 3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <p class="empty-state-title">Nenhuma consulta registrada</p>
    <p class="empty-state-text">O histórico do paciente aparecerá aqui a partir da primeira consulta.</p>
  `;
  return div;
}

function criarEstadoErroHistorico(mensagem) {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.innerHTML = `
    <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="12" cy="12" r="9" stroke-linecap="round"/>
      <path d="M12 8v5M12 16h.01" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <p class="empty-state-title">Não foi possível carregar o histórico</p>
    <p class="empty-state-text">${mensagem}</p>
  `;
  return div;
}

// ============================================
// Botão "Editar" (dados pessoais) -- só design por enquanto.
//
// Permissão: só médico/enfermeiro editam (regra de produto). O back
// hoje aceitaria admin no PUT (requer_papel_clinico com "admin") --
// a UI simplesmente não oferece o botão; endurecer o back é um TODO lá.
//
// TODO (edição de dados pessoais, ainda não implementada):
//   #btn-editar-pessoal -> abrir formulário editável (modal nos
//   moldes de profissionaisModal.js), usando
//   PacienteAtualizarPessoalSchema como contrato via
//   validarAtualizarPacientePessoal (pacienteValidation.js) e
//   atualizarPacientePessoal() (pacientesApi.js). Campos IMUTÁVEIS
//   (desabilitados no formulário): nome_completo, cpf e
//   data_nascimento -- regra de produto; o back já rejeita cpf e
//   data_nascimento (nem existem no schema de atualização), mas
//   nome_completo ainda é aceito (decidir: remover do schema ou
//   manter restrição só no front).
//
// TODO (dados clínicos, MOVIDO para o fluxo de consulta):
//   Alergias, medicamentos em uso, doenças crônicas e consentimento
//   LGPD deixaram de ser geridos nesta ficha -- são registrados
//   durante a consulta (ver pacientesCriacao.js, botão "Salvar e
//   iniciar consulta", ainda apontando para um placeholder). Quando o
//   módulo de Consultas existir, avaliar se esses dados também devem
//   voltar a aparecer aqui (mesmo que só como leitura) usando
//   buscarDetalheClinico/buscarDetalheCompleto.
// ============================================
function configurarBotaoEditar() {
  const btn = document.getElementById('btn-editar-pessoal');
  if (!btn) return;

  if (!podeVerClinico) {
    btn.setAttribute('hidden', '');
    return;
  }

  btn.addEventListener('click', () => {
    console.log('TODO: editar dados pessoais -- ainda não implementado.');
  });
}
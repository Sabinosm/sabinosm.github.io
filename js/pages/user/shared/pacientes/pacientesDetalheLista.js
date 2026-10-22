// pacientesDetalheLista.js
//
// Orquestra a ficha do paciente (pacientesDetalhe.html):
//   - Dados pessoais  (GET /pacientes/pessoal/<uuid>)
//   - Histórico       (GET /consultas/paciente/historico/<uuid>,
//                      últimas 5 -- o repository limita)
//   - Edição          (modal com dois submits: pessoal e clínico)
//
// Permissões (derivadas do snapshot do /me -- ver
// userCachePermissoes.js; o front decide o que mostrar, o back é quem
// efetivamente bloqueia):
//   - admin (só 'gerenciar'): vê dados pessoais + histórico + tipo
//     sanguíneo/peso/altura (decisão: exibir para todos). Edita dados
//     pessoais e clínicos (o back aceita os três papéis no PUT).
//     NÃO vê o conteúdo das consultas: o botão "Ver detalhes" não é
//     renderizado (GET /consultas/<uuid> só aceita médico/enfermeiro).
//   - médico/enfermeiro ('atenderClinicamente'): vê tudo, inclusive o
//     botão "Ver detalhes" de cada consulta.
//
// Sem step-up nas leituras: as rotas de detalhe do back usam
// acesso_auditado (só logam o acesso), não acao_sensivel -- ver
// pacientesApi.js.

import {
  ApiError, buscarDetalhePessoal, listarHistoricoConsultas,
  atualizarPacientePessoal, atualizarPacienteClinico, registrarTipoSanguineo,
} from "./pacientesApi.js";
import { validarAtualizarPacientePessoal } from "../../../../sharedConfig/validacoes/pacienteValidation.js";
import { exibirMensagem } from "../../../../shared/feedback.js";
import { getPermissoes, temAlguma } from "../../../../sharedConfig/userCacheHelpers/userCachePermissoes.js";
import { iniciarPagina } from "../../../../sharedConfig/loaders/initPagina.js";

// Derivado do cache do /me em DOMContentLoaded (o snapshot já existe
// neste ponto da página -- a ficha exige sessão).
let podeVerClinico = false;
let uuidPacienteAtual = null;
// Snapshot dos dados carregados -- usado pelo modal de edição para
// pré-preencher os campos e detectar o que realmente mudou.
let dadosPacienteAtual = null;

document.addEventListener('DOMContentLoaded', () => {
  iniciarPagina();

  podeVerClinico = temAlguma(getPermissoes(), 'atenderClinicamente');

  const uuid = new URLSearchParams(window.location.search).get('uuid');
  if (!uuid) {
    mostrarErro('Nenhum paciente informado na URL (parâmetro "uuid" ausente).');
    return;
  }

  uuidPacienteAtual = uuid;
  configurarBotaoEditar();
  configurarModalEdicao();
  carregarFicha(uuid);
  carregarHistorico(uuid);
});

// ============================================
// Carregamento — dados pessoais
// ============================================
async function carregarFicha(uuid) {
  try {
    const resposta = await buscarDetalhePessoal(uuid);
    dadosPacienteAtual = resposta.data;
    preencherHeader(dadosPacienteAtual);
    preencherPessoal(dadosPacienteAtual, dadosPacienteAtual.pessoal);

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
  // Tipo sanguíneo: decisão de produto -- exibido para todos os papéis
  // (o back já o envia no to_dict() de /pessoal/<uuid>).
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
  preencherTexto('pf-view-peso', dados.peso != null ? String(dados.peso).replace('.', ',') : '');
  preencherTexto('pf-view-altura', dados.altura != null ? `${dados.altura} cm` : '');
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
  // só aceita médico/enfermeiro (admin vê a lista do histórico, mas não
  // o conteúdo da consulta). A página de detalhe da consulta fica em
  // user/clinico/consulta/ -- mesma profundidade de diretório que esta
  // ficha (user/shared/pacientes/), então o caminho relativo sobe os
  // mesmos níveis e desce em clinico/consulta/.
  if (podeVerClinico) {
    const btn = document.createElement('button');
    btn.className = 'btn-ghost';
    btn.textContent = 'Ver detalhes';
    btn.addEventListener('click', () => {
      window.location.href =
        `../../clinico/consulta/consultaDetalhe.html?uuid=${encodeURIComponent(c.uuid)}`;
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
// MODAL DE EDIÇÃO
// ============================================
//
// Dois grupos num único modal, mas DOIS submits separados:
//
//   "Salvar dados pessoais" (btn-secondary)
//     -> valida só o grupo pessoal (validarAtualizarPacientePessoal)
//     -> PUT /pacientes/pessoal/<uuid>
//
//   "Salvar tudo" (submit do form / btn-primary)
//     -> valida o grupo pessoal E o grupo clínico
//     -> PUT /pacientes/pessoal/<uuid> (se houver mudança pessoal)
//     -> PUT /pacientes/clinico/<uuid> com { peso?, altura? } (se houver)
//     -> POST /pacientes/clinico/<uuid>/tipo-sanguineo (SÓ se o tipo
//        mudou -- cada alteração gera uma observação nova no histórico,
//        não sobrescreve a anterior)
//
// Os três papéis editam (decisão de produto atualizada: admin incluído).
// ============================================

const IDS_EDIT = [
  'pac-edit-nome', 'pac-edit-telefone', 'pac-edit-email',
  'pac-edit-logradouro', 'pac-edit-numero', 'pac-edit-cep', 'pac-edit-rg',
  'pac-edit-emergencia-nome', 'pac-edit-emergencia-telefone',
  'pac-edit-peso', 'pac-edit-altura', 'pac-edit-tipo-sanguineo',
];

let enviandoEdicao = false;

function configurarModalEdicao() {
  const overlay = document.getElementById('pac-edit-overlay');
  if (!overlay) return;

  document.getElementById('pac-edit-close')?.addEventListener('click', fecharModalEdicao);
  document.getElementById('pac-edit-cancel')?.addEventListener('click', fecharModalEdicao);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) fecharModalEdicao();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('settings-overlay--visible')) {
      fecharModalEdicao();
    }
  });

  // "Salvar dados pessoais": valida e envia só o grupo pessoal.
  document.getElementById('pac-edit-salvar-pessoal')?.addEventListener('click', () => salvarEdicao({ soPessoal: true }));

  // "Salvar tudo": submit do form -- valida e envia os dois grupos.
  document.getElementById('form-editar-paciente')?.addEventListener('submit', (e) => {
    e.preventDefault();
    salvarEdicao({ soPessoal: false });
  });
}

function abrirModalEdicao() {
  if (!dadosPacienteAtual) return;
  preencherModalEdicao(dadosPacienteAtual);
  limparErrosEdicao();
  document.getElementById('pac-edit-overlay')?.classList.add('settings-overlay--visible');
  document.getElementById('pac-edit-nome')?.focus();
}

function fecharModalEdicao() {
  document.getElementById('pac-edit-overlay')?.classList.remove('settings-overlay--visible');
  limparErrosEdicao();
  enviandoEdicao = false;
  const btnTudo = document.getElementById('pac-edit-salvar-tudo');
  const btnPessoal = document.getElementById('pac-edit-salvar-pessoal');
  if (btnTudo) { btnTudo.disabled = false; }
  if (btnPessoal) { btnPessoal.disabled = false; }
}

function preencherModalEdicao(dados) {
  const p = dados.pessoal ?? {};
  setValor('pac-edit-nome', p.nome_completo ?? '');
  setValor('pac-edit-telefone', p.telefone ?? '');
  setValor('pac-edit-email', p.email ?? '');
  setValor('pac-edit-logradouro', p.logradouro ?? '');
  setValor('pac-edit-numero', p.numero_residencia ?? '');
  setValor('pac-edit-cep', p.cep ?? '');
  setValor('pac-edit-rg', p.rg ?? '');
  setValor('pac-edit-emergencia-nome', p.contato_emergencia_nome ?? '');
  setValor('pac-edit-emergencia-telefone', p.contato_emergencia_telefone ?? '');
  setValor('pac-edit-peso', dados.peso != null ? String(dados.peso) : '');
  setValor('pac-edit-altura', dados.altura != null ? String(dados.altura) : '');
  setValor('pac-edit-tipo-sanguineo', dados.tipo_sanguineo ?? '');
}

function setValor(id, valor) {
  const el = document.getElementById(id);
  if (el) el.value = valor;
}

// ---- leitura dos campos ----

function lerCamposPessoais() {
  return {
    nome_completo: document.getElementById('pac-edit-nome')?.value.trim() ?? '',
    telefone: document.getElementById('pac-edit-telefone')?.value.trim() ?? '',
    email: document.getElementById('pac-edit-email')?.value.trim() ?? '',
    logradouro: document.getElementById('pac-edit-logradouro')?.value.trim() ?? '',
    numero_residencia: document.getElementById('pac-edit-numero')?.value.trim() ?? '',
    cep: document.getElementById('pac-edit-cep')?.value.trim() ?? '',
    rg: document.getElementById('pac-edit-rg')?.value.trim() ?? '',
    contato_emergencia_nome: document.getElementById('pac-edit-emergencia-nome')?.value.trim() ?? '',
    contato_emergencia_telefone: document.getElementById('pac-edit-emergencia-telefone')?.value.trim() ?? '',
  };
}

function lerCamposClinicos() {
  const pesoRaw = document.getElementById('pac-edit-peso')?.value.trim() ?? '';
  const alturaRaw = document.getElementById('pac-edit-altura')?.value.trim() ?? '';
  return {
    peso: pesoRaw === '' ? null : Number(pesoRaw.replace(',', '.')),
    altura: alturaRaw === '' ? null : Number(alturaRaw),
    tipo_sanguineo: document.getElementById('pac-edit-tipo-sanguineo')?.value ?? '',
  };
}

// ---- validação ----

function validarClinicos({ peso, altura, tipo_sanguineo }) {
  const erros = {};
  if (peso !== null && (!Number.isFinite(peso) || peso <= 0 || peso >= 1000)) {
    erros['pac-edit-peso'] = 'Peso inválido (deve ser maior que 0 e menor que 1000 kg).';
  }
  if (altura !== null && (!Number.isInteger(altura) || altura <= 0 || altura >= 300)) {
    erros['pac-edit-altura'] = 'Altura inválida (deve ser um número inteiro entre 1 e 299 cm).';
  }
  // tipo_sanguineo: '' (não informar) ou um valor do select -- o próprio
  // select limita as opções, então não precisa validar o conteúdo.
  return erros;
}

// ---- envio ----

/**
 * @param {{ soPessoal: boolean }} opcoes
 */
async function salvarEdicao({ soPessoal }) {
  if (enviandoEdicao || !uuidPacienteAtual) return;

  limparErrosEdicao();

  // 1) valida o grupo pessoal (sempre -- mesmo no "salvar tudo")
  const camposPessoais = lerCamposPessoais();
  const validacaoPessoal = validarAtualizarPacientePessoal(camposPessoais);
  const errosPessoais = mapearErrosPessoais(validacaoPessoal.erros);

  // 2) valida o grupo clínico (só no "salvar tudo")
  let camposClinicos = null;
  let errosClinicos = {};
  if (!soPessoal) {
    camposClinicos = lerCamposClinicos();
    errosClinicos = validarClinicos(camposClinicos);
  }

  const todosErros = { ...errosPessoais, ...errosClinicos };
  if (Object.keys(todosErros).length > 0) {
    aplicarErrosEdicao(todosErros);
    exibirMensagem('Confira os campos destacados antes de continuar.', 'erro');
    return;
  }

  // 3) monta os payloads só com o que realmente mudou
  const payloadPessoal = diffPessoal(camposPessoais, validacaoPessoal.dados);
  const payloadClinico = soPessoal || !camposClinicos ? {} : diffClinico(camposClinicos);
  const tipoSanguineoMudou = !soPessoal && camposClinicos &&
    camposClinicos.tipo_sanguineo !== (dadosPacienteAtual?.tipo_sanguineo ?? '');

  if (soPessoal && Object.keys(payloadPessoal).length === 0) {
    exibirMensagem('Nenhuma alteração nos dados pessoais.', 'info');
    return;
  }
  if (!soPessoal && Object.keys(payloadPessoal).length === 0 &&
      Object.keys(payloadClinico).length === 0 && !tipoSanguineoMudou) {
    exibirMensagem('Nenhuma alteração detectada.', 'info');
    return;
  }

  // 4) envia
  enviandoEdicao = true;
  const btnTudo = document.getElementById('pac-edit-salvar-tudo');
  const btnPessoal = document.getElementById('pac-edit-salvar-pessoal');
  if (btnTudo) btnTudo.disabled = true;
  if (btnPessoal) btnPessoal.disabled = true;

  try {
    const promessas = [];
    if (Object.keys(payloadPessoal).length > 0) {
      promessas.push(atualizarPacientePessoal(uuidPacienteAtual, payloadPessoal));
    }
    if (Object.keys(payloadClinico).length > 0) {
      promessas.push(atualizarPacienteClinico(uuidPacienteAtual, payloadClinico));
    }
    if (tipoSanguineoMudou && camposClinicos.tipo_sanguineo) {
      promessas.push(registrarTipoSanguineo(uuidPacienteAtual, camposClinicos.tipo_sanguineo));
    }

    await Promise.all(promessas);

    exibirMensagem('Dados do paciente atualizados.', 'sucesso');
    fecharModalEdicao();
    await carregarFicha(uuidPacienteAtual); // recarrega a ficha com os novos dados
  } catch (erro) {
    const mensagem = erro instanceof ApiError
      ? erro.message
      : 'Não foi possível atualizar os dados do paciente.';
    exibirMensagem(mensagem, 'erro');
    enviandoEdicao = false;
    if (btnTudo) btnTudo.disabled = false;
    if (btnPessoal) btnPessoal.disabled = false;
  }
}

// ---- diff (só envia o que mudou) ----

function norm(v) {
  return (v ?? '').toString().trim();
}

function diffPessoal(campos, validados) {
  const atual = dadosPacienteAtual?.pessoal ?? {};
  const payload = {};
  // usa os valores VALIDADOS (já normalizados pelo validador) para o diff
  const candidatos = { ...campos, ...validados };
  for (const [chave, valor] of Object.entries(candidatos)) {
    if (norm(valor) !== norm(atual[chave])) payload[chave] = valor || null;
  }
  return payload;
}

function diffClinico({ peso, altura }) {
  const payload = {};
  const pesoAtual = dadosPacienteAtual?.peso ?? null;
  const alturaAtual = dadosPacienteAtual?.altura ?? null;
  if (peso !== pesoAtual) payload.peso = peso;
  if (altura !== alturaAtual) payload.altura = altura;
  return payload;
}

// ---- erros ----

// O validador devolve erros com chaves do schema do back
// (nome_completo, telefone...); o modal usa ids pac-edit-*.
const CAMPO_PESSOAL_PARA_ID = {
  nome_completo: 'pac-edit-nome',
  telefone: 'pac-edit-telefone',
  email: 'pac-edit-email',
  logradouro: 'pac-edit-logradouro',
  numero_residencia: 'pac-edit-numero',
  cep: 'pac-edit-cep',
  rg: 'pac-edit-rg',
  contato_emergencia_nome: 'pac-edit-emergencia-nome',
  contato_emergencia_telefone: 'pac-edit-emergencia-telefone',
};

function mapearErrosPessoais(erros) {
  const mapeados = {};
  for (const [campo, msg] of Object.entries(erros ?? {})) {
    const id = CAMPO_PESSOAL_PARA_ID[campo];
    if (id) mapeados[id] = msg;
  }
  return mapeados;
}

function aplicarErrosEdicao(erros) {
  Object.entries(erros).forEach(([id, mensagem]) => {
    const input = document.getElementById(id);
    const erroEl = document.getElementById(`${id}-error`);
    if (erroEl) erroEl.textContent = mensagem;
    input?.closest('.field-group')?.classList.add('field-group--has-error');
  });
}

function limparErrosEdicao() {
  IDS_EDIT.forEach(id => {
    const input = document.getElementById(id);
    const erroEl = document.getElementById(`${id}-error`);
    if (erroEl) erroEl.textContent = '';
    input?.closest('.field-group')?.classList.remove('field-group--has-error');
  });
}

// ============================================
// Botão "Editar" — abre o modal
// ============================================
function configurarBotaoEditar() {
  document.getElementById('btn-editar-pessoal')?.addEventListener('click', abrirModalEdicao);
}